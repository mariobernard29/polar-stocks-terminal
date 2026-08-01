import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeImage, shell, session } from 'electron'
import { closeDatabase, initDatabase } from './db/client'
import { handlers } from './ipc/handlers'
import { getStreamToken, initProviders } from './providers'
import { initRealtime, resetSubscriptions, shutdownRealtime } from './realtime'
import { emitIpcEvent, registerIpcHandlers } from './ipc/register'
import { initLogger, logger } from './lib/logger'

const isDev = !app.isPackaged

/** Protocolos a los que se permite salir hacia el sistema operativo. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:'])

let mainWindow: BrowserWindow | null = null

/**
 * Icono de la ventana y de la barra de tareas.
 *
 * En desarrollo se lee de `resources/`; en producción, de los recursos
 * empaquetados. El icono del instalador y del ejecutable lo genera
 * electron-builder desde el mismo PNG (ver `npm run icons`).
 */
function resolveWindowIcon(): Electron.NativeImage | undefined {
  const iconPath = isDev
    ? join(process.cwd(), 'resources', 'icon.png')
    : join(process.resourcesPath, 'icon.png')

  const image = nativeImage.createFromPath(iconPath)
  // Un icono que no carga no debe impedir que la aplicación abra.
  return image.isEmpty() ? undefined : image
}

function createMainWindow(): BrowserWindow {
  const icon = resolveWindowIcon()

  const window = new BrowserWindow({
    ...(icon ? { icon } : {}),
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#08090a',
    autoHideMenuBar: true,
    // Ventana sin marco: la barra de título la dibuja la propia aplicación, con
    // el buscador y los relojes integrados. Es lo que permite aprovechar esa
    // franja en lugar de perderla con la decoración del sistema.
    frame: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Postura de seguridad: el renderer es contenido no privilegiado.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })

  // Evita el parpadeo blanco del arranque: se muestra ya pintada.
  window.once('ready-to-show', () => window.show())

  // La barra de título propia necesita saber el estado real, que también puede
  // cambiar por doble clic o por atajo del sistema, no solo por nuestros botones.
  window.on('maximize', () => emitIpcEvent(window, 'window:maximizedChanged', true))
  window.on('unmaximize', () => emitIpcEvent(window, 'window:maximizedChanged', false))

  // Los enlaces externos salen al navegador del sistema, no abren ventanas Electron.
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url)
      if (ALLOWED_EXTERNAL_PROTOCOLS.has(protocol)) void shell.openExternal(url)
    } catch {
      logger.warn(`[window] URL malformada bloqueada: ${url}`)
    }
    return { action: 'deny' }
  })

  // Bloquea la navegación fuera de la app (defensa ante XSS o redirecciones).
  window.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    const isInternal = rendererUrl ? url.startsWith(rendererUrl) : url.startsWith('file://')
    if (!isInternal) {
      event.preventDefault()
      logger.warn(`[window] navegación bloqueada hacia ${url}`)
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}

/**
 * CSP estricta. En desarrollo se relaja lo mínimo para que funcionen el HMR de
 * Vite (websocket + estilos inyectados); en producción no hay excepciones.
 */
function applyContentSecurityPolicy(): void {
  /**
   * Marcos de TradingView.
   *
   * Es la **única** concesión a un tercero, y se limita a `frame-src`: el widget
   * se embebe como iframe, así que su código corre aislado en el origen de
   * TradingView. Nunca se permite `script-src` externo — el método de
   * incrustación que ellos documentan inyecta un script en nuestra página, y en
   * una aplicación que guarda claves de API eso es un riesgo innecesario.
   */
  // `s.tradingview.com` redirige a `tradingview-widget.com`, así que hacen falta
  // ambos dominios o el marco se queda en blanco tras el redirect.
  const tradingViewFrames =
    'https://s.tradingview.com https://www.tradingview.com https://www.tradingview-widget.com'

  const policy = isDev
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws: http://localhost:*",
        `frame-src ${tradingViewFrames}`,
      ]
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        // `https:` en imágenes es necesario para los logotipos de empresa y las
        // miniaturas de noticias, que vienen de dominios de terceros.
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        `frame-src ${tradingViewFrames}`,
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ]

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']

  /**
   * ¿Es este un documento **nuestro**?
   *
   * Importa mucho: `onHeadersReceived` intercepta todas las peticiones de la
   * sesión, incluidas las de dentro de un iframe de terceros. Aplicando la CSP
   * sin filtrar, se le estaba imponiendo nuestra política al documento de
   * TradingView y su propio widget quedaba bloqueado — sus scripts violaban
   * *nuestro* `script-src`.
   *
   * Reescribir las cabeceras de un tercero no protege nada: su contenido ya
   * está aislado en otro origen por el iframe. Nuestra política solo tiene
   * sentido sobre nuestras propias páginas.
   */
  const isOwnDocument = (url: string): boolean =>
    url.startsWith('file://') || (rendererUrl !== undefined && url.startsWith(rendererUrl))

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isOwnDocument(details.url)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy.join('; ')],
      },
    })
  })
}

// Una sola instancia: abrir la app de nuevo enfoca la ventana existente en vez
// de arrancar un segundo proceso que competiría por el mismo archivo SQLite.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    initLogger(isDev)
    logger.info(`[app] arrancando ${app.getName()} ${app.getVersion()} (dev=${isDev})`)

    // Sin menú por defecto. No es cosmético: el menú estándar de Electron se
    // queda con aceleradores que la aplicación necesita — `Ctrl+W` cerraría la
    // ventana entera en lugar de cerrar el panel activo.
    Menu.setApplicationMenu(null)

    applyContentSecurityPolicy()

    // La base de datos se abre y se migra ANTES de crear la ventana. Si el
    // esquema no está listo, la primera consulta del renderer fallaría con un
    // error incomprensible; es mejor no llegar a pintar nada.
    try {
      await initDatabase(isDev)
    } catch (error) {
      logger.error('[app] no se pudo inicializar la base de datos', error)
      dialog.showErrorBox(
        'Polar Stocks Terminal',
        'No se pudo abrir la base de datos local.\n\n' +
          'Revisa el registro de la aplicación para más detalle.\n\n' +
          String(error instanceof Error ? error.message : error),
      )
      app.quit()
      return
    }

    // Los proveedores se registran después de la base de datos: su
    // configuración (activo, prioridad, si hay clave) vive en ella.
    await initProviders()

    registerIpcHandlers(handlers, { isDev })

    mainWindow = createMainWindow()

    // El flujo en vivo necesita una ventana a la que emitir y la clave del
    // proveedor; ambas existen ya en este punto.
    initRealtime(mainWindow, () => getStreamToken())

    // Al recargarse el renderer, los paneles anteriores dejan de existir. Sin
    // reiniciar las suscripciones, sus referencias quedarían contadas para
    // siempre y el socket abierto sin nadie escuchando.
    mainWindow.webContents.on('did-start-navigation', (event) => {
      if (event.isSameDocument) return
      resetSubscriptions()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Cierre limpio: deja el archivo SQLite sin journal pendiente y el socket
  // cerrado en vez de esperar a que el sistema lo corte.
  app.on('will-quit', () => {
    shutdownRealtime()
    void closeDatabase()
  })
}
