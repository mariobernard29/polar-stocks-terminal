import { z } from 'zod'

/**
 * Validación de los ajustes de la aplicación.
 *
 * Los valores se guardan como JSON en la tabla `settings`. Un ajuste
 * desconocido o corrupto en la base cae al valor por defecto en vez de romper
 * el arranque: una preferencia mal guardada no debe impedir abrir la app.
 *
 * Los **valores por defecto no están aquí**: viven en `settings-defaults.ts`,
 * sin zod, porque el renderer los usa sin necesitar validar nada.
 *
 * El `satisfies Record<SettingKey, …>` de abajo es lo que impide que las dos
 * mitades se separen: falta un esquema, o sobra uno cuya clave no existe, y no
 * compila. Mismo trato que entre `channels.ts` y `contract.ts`.
 */
export const settingSchemas = {
  'general.language': z.enum(['es', 'en']),
  'general.launchOnStartup': z.boolean(),
  'general.restoreLastLayout': z.boolean(),

  /**
   * Proveedor de IA activo.
   *
   * Conmutable en caliente y sin ninguno cableado, como se decidió en Fase 1.
   * El modelo va aparte y en texto libre: los catálogos cambian cada pocos
   * meses, y un `enum` obligaría a publicar una versión de la aplicación para
   * poder usar un modelo que ya existe.
   */
  'ai.provider': z.enum(['anthropic', 'openai', 'gemini']),
  'ai.model': z.string().max(100),

  'appearance.density': z.enum(['comfortable', 'compact']),
  'appearance.marketColors': z.enum(['standard', 'inverted', 'colorblind']),
  'appearance.chartProvider': z.enum(['tradingview', 'native']),
  'appearance.reduceMotion': z.boolean(),

  /** Zona horaria secundaria de la barra superior. Nueva York por defecto. */
  'general.secondaryTimezone': z.string(),

  'data.cacheTtlSeconds': z.number().int().min(0).max(86_400),
  'data.autoRefresh': z.boolean(),
} as const satisfies Record<string, z.ZodType>

/** Clave de un ajuste. Sale de los esquemas: son la definición canónica. */
export type SettingKey = keyof typeof settingSchemas

/**
 * Todos los ajustes con sus valores. Es lo que viaja por IPC de una vez.
 *
 * Los valores por defecto de  se declaran contra este
 * tipo, y ahí está la garantía de que no se separen.
 */
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> }

export const settingsSchema = z.object(settingSchemas)

/** El esquema de un ajuste suelto, para validar escrituras parciales. */
export function schemaFor(key: SettingKey): z.ZodType {
  return settingSchemas[key]
}

export { DEFAULT_SETTINGS, SETTING_KEYS, defaultSettings } from './settings-defaults'
