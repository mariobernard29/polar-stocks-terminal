import type { IpcHandler } from '../register'

/**
 * Controles de la ventana sin marco.
 *
 * Operan sobre la ventana que originó la llamada, no sobre una referencia
 * global: cuando la app soporte varias ventanas (paneles desacoplados en una
 * fase futura), esto seguirá siendo correcto sin tocarlo.
 */

export const minimize: IpcHandler<'window:minimize'> = (_input, { window }) => {
  window?.minimize()
}

export const toggleMaximize: IpcHandler<'window:toggleMaximize'> = (_input, { window }) => {
  if (!window) return false
  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
  return window.isMaximized()
}

export const close: IpcHandler<'window:close'> = (_input, { window }) => {
  window?.close()
}

export const isMaximized: IpcHandler<'window:isMaximized'> = (_input, { window }) =>
  window?.isMaximized() ?? false

/**
 * Pantalla completa (F11).
 *
 * En una ventana sin marco, salir de pantalla completa devuelve a la ventana su
 * barra de título propia; Electron lo gestiona solo, no hay que restaurarla.
 */
export const toggleFullscreen: IpcHandler<'window:toggleFullscreen'> = (_input, { window }) => {
  if (!window) return false
  const next = !window.isFullScreen()
  window.setFullScreen(next)
  return next
}
