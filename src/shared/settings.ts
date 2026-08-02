import { z } from 'zod'

/**
 * Catálogo de ajustes de la aplicación.
 *
 * Cada ajuste declara su esquema y su valor por defecto en un único sitio. De
 * aquí salen los tipos, la validación y los valores iniciales, así que añadir
 * una preferencia es añadir una línea — no tocar una migración, ni un tipo, ni
 * un valor por defecto disperso.
 *
 * Vive en `shared` porque la pantalla de Configuración (renderer) y el
 * repositorio (main) necesitan exactamente la misma definición.
 *
 * Los valores se guardan como JSON en la tabla `settings`. Un ajuste
 * desconocido o corrupto en la base cae al valor por defecto en vez de romper
 * el arranque: una preferencia mal guardada no debe impedir abrir la app.
 */
export const settingsCatalog = {
  'general.language': { schema: z.enum(['es', 'en']), default: 'es' },
  'general.launchOnStartup': { schema: z.boolean(), default: false },
  'general.restoreLastLayout': { schema: z.boolean(), default: true },

  /**
   * Proveedor de IA activo.
   *
   * Conmutable en caliente y sin ninguno cableado, como se decidió en Fase 1.
   * El modelo va aparte y en texto libre: los catálogos cambian cada pocos
   * meses, y un `enum` obligaría a publicar una versión de la aplicación para
   * poder usar un modelo que ya existe.
   */
  'ai.provider': { schema: z.enum(['anthropic', 'openai', 'gemini']), default: 'anthropic' },
  'ai.model': { schema: z.string().max(100), default: '' },

  'appearance.density': { schema: z.enum(['comfortable', 'compact']), default: 'comfortable' },
  'appearance.marketColors': {
    schema: z.enum(['standard', 'inverted', 'colorblind']),
    default: 'standard',
  },
  'appearance.chartProvider': {
    schema: z.enum(['tradingview', 'native']),
    default: 'tradingview',
  },
  'appearance.reduceMotion': { schema: z.boolean(), default: false },

  /** Zona horaria secundaria de la barra superior. Nueva York por defecto. */
  'general.secondaryTimezone': { schema: z.string(), default: 'America/New_York' },

  'data.cacheTtlSeconds': { schema: z.number().int().min(0).max(86_400), default: 300 },
  'data.autoRefresh': { schema: z.boolean(), default: true },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>

export type SettingsCatalog = typeof settingsCatalog
export type SettingKey = keyof SettingsCatalog

export type SettingValue<K extends SettingKey> = z.infer<SettingsCatalog[K]['schema']>

/** Todos los ajustes con sus valores. Es lo que viaja por IPC de una vez. */
export type Settings = { [K in SettingKey]: SettingValue<K> }

export const SETTING_KEYS = Object.keys(settingsCatalog) as readonly SettingKey[]

/** Esquema del objeto completo, para validar lo que cruza el IPC. */
export const settingsSchema = z.object(
  Object.fromEntries(
    Object.entries(settingsCatalog).map(([key, definition]) => [key, definition.schema]),
  ) as { [K in SettingKey]: SettingsCatalog[K]['schema'] },
)

export function defaultSettings(): Settings {
  return Object.fromEntries(
    Object.entries(settingsCatalog).map(([key, definition]) => [key, definition.default]),
  ) as Settings
}
