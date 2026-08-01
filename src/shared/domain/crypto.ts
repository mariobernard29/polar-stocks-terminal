import { z } from 'zod'
import { symbolSchema } from './instrument'

/**
 * Métricas propias de una criptomoneda.
 *
 * Son datos que no existen en renta variable —supply circulante, supply máximo,
 * dominancia— y por eso viven en su propio tipo en vez de ensuciar
 * `CompanyProfile` con campos que siempre serían `null` para una acción.
 */
export const cryptoMetricsSchema = z.object({
  symbol: symbolSchema,
  name: z.string(),

  price: z.number(),
  marketCap: z.number().nullable(),
  /** Puesto por capitalización. */
  marketCapRank: z.number().int().nullable(),
  volume24h: z.number().nullable(),

  /** Monedas en circulación. */
  circulatingSupply: z.number().nullable(),
  /** Emisión total ya creada. */
  totalSupply: z.number().nullable(),
  /** Tope de emisión. `null` cuando no lo hay (Ethereum, por ejemplo). */
  maxSupply: z.number().nullable(),

  /** Porcentaje de la capitalización total del mercado cripto. */
  dominance: z.number().nullable(),

  allTimeHigh: z.number().nullable(),
  allTimeHighDate: z.number().int().nullable(),
  allTimeLow: z.number().nullable(),

  change24h: z.number().nullable(),
  change7d: z.number().nullable(),
  change30d: z.number().nullable(),

  logoUrl: z.url().nullable(),
  source: z.string(),
})
export type CryptoMetrics = z.infer<typeof cryptoMetricsSchema>
