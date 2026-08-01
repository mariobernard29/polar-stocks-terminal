import log from 'electron-log/main'

/**
 * Registro de la aplicación.
 *
 * Se inicializa una vez en el arranque. Los logs van a archivo (rotado por
 * electron-log) y a consola en desarrollo. Es la única vía de registro del
 * proceso main: `console.log` está prohibido por el lint precisamente para que
 * nada acabe fuera del archivo cuando la app está empaquetada y no hay consola
 * donde mirar.
 *
 * Nunca se registran valores de credenciales. Ver `security/redact.ts`.
 */
export function initLogger(isDev: boolean): void {
  log.initialize()
  log.transports.file.level = 'info'
  log.transports.console.level = isDev ? 'debug' : false
  log.errorHandler.startCatching({ showDialog: false })
}

export const logger = log.scope('main')
