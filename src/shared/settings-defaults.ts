import type { SettingKey, Settings } from './settings'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Valores por defecto de los ajustes, sin zod
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Separados del catálogo por el mismo motivo que `error-codes.ts` lo está de
 * `errors.ts`: `useSettings()` los usa como red de seguridad y no tiene por qué
 * arrastrar consigo el catálogo de esquemas de validación.
 *
 * El `import type` de arriba **desaparece al compilar**, así que este archivo no
 * lleva zod a ninguna parte. Y como el objeto está tipado `Settings`, que se
 * deriva de los esquemas, las dos mitades no pueden divergir: falta un ajuste, o
 * su valor no encaja con lo que su esquema admite, y no compila.
 */
export const DEFAULT_SETTINGS: Settings = {
  'general.language': 'es',
  'general.launchOnStartup': false,
  'general.restoreLastLayout': true,

  'ai.provider': 'anthropic',
  'ai.model': '',

  'appearance.density': 'comfortable',
  'appearance.marketColors': 'standard',
  'appearance.chartProvider': 'tradingview',
  'appearance.reduceMotion': false,

  /** Zona horaria secundaria de la barra superior. Nueva York por defecto. */
  'general.secondaryTimezone': 'America/New_York',

  'data.cacheTtlSeconds': 300,
  'data.autoRefresh': true,
}

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as readonly SettingKey[]

/**
 * Copia nueva de los valores por defecto.
 *
 * Copia y no la constante: quien la recibe puede guardarla en un estado y
 * modificarla, y compartir el mismo objeto haría que un ajuste tocado en una
 * pantalla se propagara a todas las demás.
 */
export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS }
}
