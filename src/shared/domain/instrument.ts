import { z } from 'zod'

/**
 * Clases de activo que la terminal entiende.
 *
 * `bond` existe desde ahora aunque su UI llegue en una fase posterior: añadir
 * un valor a esta unión más adelante obliga a revisar cada `switch` exhaustivo
 * del proyecto, y es más barato reservarlo hoy.
 */
export const assetClassSchema = z.enum([
  'stock',
  'etf',
  'index',
  'crypto',
  'forex',
  'commodity',
  'bond',
])
export type AssetClass = z.infer<typeof assetClassSchema>

/**
 * Símbolo normalizado por la aplicación.
 *
 * Cada proveedor usa su propia notación para el mismo activo (`BTC-USD`,
 * `BTCUSDT`, `BTC/USD`). La app trabaja siempre con esta forma canónica y cada
 * adaptador de proveedor traduce en su frontera. Sin esto, la watchlist de un
 * usuario deja de funcionar en cuanto cambia de proveedor.
 */
export const symbolSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9._:^-]+$/, 'Símbolo inválido')
export type Symbol_ = z.infer<typeof symbolSchema>

/** Identidad de un activo, sin datos de mercado. */
export const instrumentSchema = z.object({
  symbol: symbolSchema,
  name: z.string(),
  assetClass: assetClassSchema,
  /** Bolsa o mercado donde cotiza. `null` para cripto y forex OTC. */
  exchange: z.string().nullable(),
  /** Moneda de cotización en ISO 4217 (USD, EUR…). */
  currency: z.string().length(3).nullable(),
  /** Región/país principal, para agrupar y para calcular la sesión de mercado. */
  country: z.string().nullable().optional(),
})
export type Instrument = z.infer<typeof instrumentSchema>

/** Estado de la sesión de mercado en el momento de la consulta. */
export const marketStateSchema = z.enum(['pre', 'open', 'after', 'closed'])
export type MarketState = z.infer<typeof marketStateSchema>
