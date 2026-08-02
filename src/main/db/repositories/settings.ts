import {
  SETTING_KEYS,
  defaultSettings,
  settingSchemas,
  type SettingKey,
  type Settings,
} from '@shared/settings'
import { getPrisma } from '../client'
import { logger } from '../../lib/logger'

/**
 * Repositorio de ajustes.
 *
 * Traduce entre la tabla clave/valor y el objeto tipado `Settings`. Es la única
 * parte del código que sabe que los ajustes se guardan como JSON en SQLite; el
 * resto de la aplicación ve un objeto normal.
 */

/**
 * Lee todos los ajustes, rellenando con los valores por defecto lo que falte.
 *
 * Un valor corrupto o de una versión anterior del esquema **no rompe el
 * arranque**: se registra y se usa el valor por defecto. Que alguien no pueda
 * abrir su terminal porque una preferencia quedó mal guardada sería un fallo
 * mucho peor que perder esa preferencia.
 */
export async function getAllSettings(): Promise<Settings> {
  const rows = await getPrisma().setting.findMany()
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const result = defaultSettings()

  for (const key of SETTING_KEYS) {
    const raw = stored.get(key)
    if (raw === undefined) continue

    try {
      const parsed = settingSchemas[key].safeParse(JSON.parse(raw))
      if (parsed.success) {
        result[key] = parsed.data as never
      } else {
        logger.warn(`[settings] "${key}" tiene un valor inválido; se usa el valor por defecto`)
      }
    } catch {
      logger.warn(`[settings] "${key}" no es JSON válido; se usa el valor por defecto`)
    }
  }

  return result
}

/** Escribe un ajuste. El valor se valida contra el catálogo antes de guardarlo. */
export async function setSetting<K extends SettingKey>(
  key: K,
  value: Settings[K],
): Promise<void> {
  const parsed = settingSchemas[key].safeParse(value)
  if (!parsed.success) {
    throw new Error(`Valor inválido para el ajuste "${key}"`)
  }

  const serialized = JSON.stringify(parsed.data)
  await getPrisma().setting.upsert({
    where: { key },
    create: { key, value: serialized },
    update: { value: serialized },
  })
}

/** Devuelve todos los ajustes a sus valores por defecto. */
export async function resetSettings(): Promise<Settings> {
  await getPrisma().setting.deleteMany({})
  return defaultSettings()
}
