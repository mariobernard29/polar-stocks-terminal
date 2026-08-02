import { app } from 'electron'
import type { SettingKey, Settings } from '@shared/settings'
import { getAllSettings, resetSettings, setSetting } from '../../db/repositories/settings'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

/**
 * Aplica «abrir al iniciar sesión» al sistema operativo.
 *
 * El ajuste existía desde la Fase 1 pero no hacía nada: era un interruptor que
 * prometía algo que no ocurría. Ahora que hay instalador tiene sentido de verdad.
 *
 * Solo en la aplicación instalada. En desarrollo registraría el ejecutable de
 * Electron de `node_modules`, que abriría una ventana vacía en cada inicio de
 * sesión y sería un incordio difícil de relacionar con su causa.
 */
export function applyLaunchOnStartup(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled })
}

export const getAll: IpcHandler<'settings:getAll'> = async () => getAllSettings()

/**
 * Aplica un parche de ajustes y devuelve el estado completo resultante.
 *
 * El contrato ya validó cada valor contra su esquema, así que aquí solo queda
 * escribir. Se convierten los fallos de base de datos en un error tipado para
 * que la interfaz pueda distinguirlos de un problema de validación.
 */
export const update: IpcHandler<'settings:update'> = async (patch) => {
  try {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      await setSetting(key as SettingKey, value as never)
    }
  } catch (error) {
    throw new AppError('DATABASE_ERROR', 'No se pudieron guardar los ajustes.', { cause: error })
  }

  const settings = (await getAllSettings()) as Settings

  // Este ajuste no vive solo en la base de datos: hay que decírselo al sistema.
  if (patch['general.launchOnStartup'] !== undefined) {
    applyLaunchOnStartup(settings['general.launchOnStartup'])
  }

  return settings
}

export const reset: IpcHandler<'settings:reset'> = async () => {
  try {
    return await resetSettings()
  } catch (error) {
    throw new AppError('DATABASE_ERROR', 'No se pudieron restablecer los ajustes.', {
      cause: error,
    })
  }
}
