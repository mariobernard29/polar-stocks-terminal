import { z } from 'zod'
import { assetClassSchema, symbolSchema } from './instrument'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Screener
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Los criterios son **preajustes**, no filtros libres, y eso es una decisión
 * impuesta por los datos disponibles: el endpoint de screener con filtros
 * arbitrarios de FMP (capitalización, PER, sector, dividendo) responde 402 en el
 * plan gratuito.
 *
 * Lo que sí hay es real y de mercado completo: mayores subidas, mayores bajadas
 * y más negociadas para renta variable, y ordenación por capitalización o
 * volumen para criptomonedas. Ofrecer preajustes que funcionan es preferible a
 * ofrecer un formulario de filtros que devolvería un error de suscripción.
 */
export const screenerPresetSchema = z.enum([
  /** Mayores subidas de la sesión. */
  'gainers',
  /** Mayores bajadas de la sesión. */
  'losers',
  /** Más negociadas por volumen. */
  'actives',
  /** Mayor capitalización. Solo cripto. */
  'marketCap',
])
export type ScreenerPreset = z.infer<typeof screenerPresetSchema>

export const screenerQuerySchema = z.object({
  assetClass: z.enum(['stock', 'crypto']),
  preset: screenerPresetSchema,
  limit: z.number().int().min(1).max(100).default(30),
})
export type ScreenerQuery = z.infer<typeof screenerQuerySchema>

export const screenerRowSchema = z.object({
  symbol: symbolSchema,
  name: z.string(),
  assetClass: assetClassSchema,
  price: z.number(),
  changePercent: z.number(),
  /** `null` cuando el proveedor no lo aporta, nunca cero. */
  marketCap: z.number().nullable(),
  volume: z.number().nullable(),
  /** Puesto por capitalización. Solo lo dan los proveedores de cripto. */
  rank: z.number().int().nullable(),
  source: z.string(),
})
export type ScreenerRow = z.infer<typeof screenerRowSchema>
