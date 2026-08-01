import { z } from 'zod'
import { newsCategorySchema } from './news'
import { symbolSchema } from './instrument'
import { timeframeSchema } from './candle'

/** Parámetros de las consultas que cruzan el IPC y llegan a los proveedores. */

export const quoteQuerySchema = z.object({
  symbol: symbolSchema,
})
export type QuoteQuery = z.infer<typeof quoteQuerySchema>

export const searchQuerySchema = z.object({
  /** Texto libre. Se acota la longitud para no mandar basura a los proveedores. */
  text: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(50).default(20),
})
export type SearchQuery = z.infer<typeof searchQuerySchema>

export const newsQuerySchema = z.object({
  /** Si se indica, noticias de ese activo; si no, generales del mercado. */
  symbol: symbolSchema.nullable().default(null),
  category: newsCategorySchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(30),
})
export type NewsQuery = z.infer<typeof newsQuerySchema>

export const historicalQuerySchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  /** Número de velas hacia atrás desde ahora. */
  limit: z.number().int().min(1).max(5000).default(300),
})
export type HistoricalQuery = z.infer<typeof historicalQuerySchema>
