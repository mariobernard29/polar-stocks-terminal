import { app, shell } from 'electron'
import type { AppInfo } from '@shared/ipc/contract'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'
import { logger } from '../../lib/logger'

export const ping: IpcHandler<'app:ping'> = () => 'pong'

export const info: IpcHandler<'app:info'> = (): AppInfo => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  isPackaged: app.isPackaged,
  versions: {
    electron: process.versions.electron ?? 'desconocida',
    chrome: process.versions.chrome ?? 'desconocida',
    node: process.versions.node ?? 'desconocida',
  },
})

/**
 * El contrato ya garantiza que la URL es https, así que aquí no hace falta
 * volver a comprobarlo: si llega, es válida.
 */
export const openExternal: IpcHandler<'app:openExternal'> = async ({ url }) => {
  try {
    await shell.openExternal(url)
  } catch (error) {
    logger.warn('[app] no se pudo abrir la URL externa', error)
    throw new AppError('INTERNAL', 'No se pudo abrir el enlace en el navegador.', {
      cause: error,
    })
  }
}
