import type { SettingKey, Settings } from '@shared/settings'
import { getAllSettings, resetSettings, setSetting } from '../../db/repositories/settings'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

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

  return getAllSettings() as Promise<Settings>
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
