import * as updater from '../../updater'
import type { IpcHandler } from '../register'

/**
 * Actualizaciones.
 *
 * Nada se descarga ni se instala sin que el usuario lo pida: son tres acciones
 * separadas a propósito. Una aplicación que se reinicia sola mientras alguien
 * mira una posición abierta no es aceptable en una herramienta financiera.
 */

export const state: IpcHandler<'updates:state'> = () => updater.getUpdateState()
export const check: IpcHandler<'updates:check'> = () => updater.check()
export const download: IpcHandler<'updates:download'> = () => updater.download()
export const install: IpcHandler<'updates:install'> = () => updater.installAndRestart()
export const openReleases: IpcHandler<'updates:openReleases'> = () => updater.openReleasesPage()
