import { app, shell, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/updates'
import { emitIpcEvent } from './ipc/register'
import { logger } from './lib/logger'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Actualizaciones
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Envoltorio fino sobre `electron-updater` con una diferencia que no es un
 * detalle: **la aplicación no está firmada**, y eso cambia lo que se puede hacer
 * en cada sistema.
 *
 * | Sistema | Sin firma |
 * |---|---|
 * | Windows | Descarga e instala. SmartScreen avisa al ejecutar el instalador. |
 * | Linux (AppImage) | Descarga e instala. |
 * | **macOS** | **No puede autoactualizarse.** |
 *
 * En macOS, Squirrel valida la firma antes de sustituir la aplicación; sin
 * firma, la instalación falla *después* de haber descargado, dejando al usuario
 * con un error incomprensible. Por eso aquí macOS solo **comprueba** si hay
 * versión nueva y ofrece abrir la página de descargas. Es menos cómodo, pero es
 * lo que de verdad funciona, y decirlo es mejor que un botón que falla al final.
 */

// `electron-updater` es CommonJS; con `"type": "module"` la importación con
// nombre no funciona y hay que desestructurar del default.
const { autoUpdater } = electronUpdater

/** Dónde se publican las versiones. Debe coincidir con `publish` del builder. */
const RELEASES_URL = 'https://github.com/mariobernard29/polar-stocks-terminal/releases/latest'

/**
 * Espera antes de la primera comprobación.
 *
 * Al arrancar hay cosas más urgentes compitiendo por la red y el disco: las
 * cotizaciones que el usuario está esperando ver. La actualización puede
 * esperar medio minuto.
 */
const FIRST_CHECK_DELAY_MS = 30_000

/** macOS sin firma no puede instalar la actualización, solo enterarse de ella. */
const canSelfUpdate = process.platform !== 'darwin'

let targetWindow: BrowserWindow | null = null
let state: UpdateState = { status: 'idle', version: null, percent: null, message: null }

function setState(next: UpdateState): void {
  state = next
  emitIpcEvent(targetWindow, 'updates:state', next)
}

export function getUpdateState(): UpdateState {
  return state
}

export function initUpdater(window: BrowserWindow): void {
  targetWindow = window

  // En desarrollo no hay nada que actualizar y `electron-updater` se queja de
  // que falta `app-update.yml`. Decirlo con claridad ahorra un susto en la
  // consola de quien arranca el proyecto por primera vez.
  if (!app.isPackaged) {
    // Sin `message`: el propio estado ya se traduce en la interfaz, y repetirlo
    // aquí en español fijo lo enseñaría dos veces y sin traducir.
    setState({ status: 'unsupported', version: null, percent: null, message: null })
    return
  }

  // Nada se descarga ni se instala sin que el usuario lo pida. Una aplicación
  // que se reinicia sola mientras alguien mira una posición abierta es
  // inaceptable en una herramienta financiera.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = logger

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', version: null, percent: null, message: null })
  })

  autoUpdater.on('update-available', (info) => {
    setState({
      status: canSelfUpdate ? 'available' : 'manual',
      version: info.version,
      percent: null,
      message: null,
    })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'current', version: app.getVersion(), percent: null, message: null })
  })

  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      version: state.version,
      percent: Math.round(progress.percent),
      message: null,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'ready', version: info.version, percent: 100, message: null })
  })

  autoUpdater.on('error', (error) => {
    logger.error('[updater] fallo', error)
    setState({
      status: 'error',
      version: state.version,
      percent: null,
      // El mensaje crudo puede traer rutas locales o URLs internas; se recorta.
      message: String(error instanceof Error ? error.message : error).slice(0, 200),
    })
  })

  setTimeout(() => void check(), FIRST_CHECK_DELAY_MS)
}

/** Comprueba si hay versión nueva. No descarga nada. */
export async function check(): Promise<UpdateState> {
  if (!app.isPackaged) return state

  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    logger.error('[updater] no se pudo comprobar', error)

    // El evento `error` ya habrá puesto el motivo concreto —«404», «sin
    // releases», «sin conexión»—. Machacarlo con un texto genérico dejaría al
    // usuario sin ninguna pista de qué mirar, así que solo se rellena si no hay
    // nada mejor que contar.
    if (state.status !== 'error' || state.message === null) {
      setState({
        status: 'error',
        version: null,
        percent: null,
        message: String(error instanceof Error ? error.message : error).slice(0, 200),
      })
    }
  }

  return state
}

/**
 * Descarga la actualización disponible.
 *
 * En macOS no se llega aquí: la interfaz ofrece la página de descargas en su
 * lugar, porque una descarga que va a fallar al instalar solo gasta ancho de
 * banda y confianza.
 */
export async function download(): Promise<void> {
  if (!app.isPackaged || !canSelfUpdate) return

  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    logger.error('[updater] no se pudo descargar', error)
    setState({
      status: 'error',
      version: state.version,
      percent: null,
      message: 'No se pudo descargar la actualización.',
    })
  }
}

/** Cierra y reinstala. Solo tiene sentido con la descarga ya terminada. */
export function installAndRestart(): void {
  if (state.status !== 'ready') return
  autoUpdater.quitAndInstall()
}

/** Abre la página de descargas. Es la vía de macOS y el plan B de todos. */
export async function openReleasesPage(): Promise<void> {
  await shell.openExternal(RELEASES_URL)
}
