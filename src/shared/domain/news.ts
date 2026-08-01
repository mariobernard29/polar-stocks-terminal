import { z } from 'zod'
import { symbolSchema } from './instrument'

export const newsCategorySchema = z.enum([
  'company',
  'crypto',
  'market',
  'economy',
  'technology',
  'ai',
  'general',
])
export type NewsCategory = z.infer<typeof newsCategorySchema>

export const newsItemSchema = z.object({
  /**
   * Identificador estable y determinista, derivado de la URL cuando el
   * proveedor no da uno propio. Es lo que permite marcar favoritos y
   * deduplicar la misma noticia llegada por dos proveedores distintos.
   */
  id: z.string(),
  headline: z.string(),
  summary: z.string().nullable(),
  url: z.url(),
  source: z.string(),
  /** Epoch ms UTC. */
  publishedAt: z.number().int(),
  /** Símbolos mencionados, ya normalizados. */
  symbols: z.array(symbolSchema),
  category: newsCategorySchema,
  imageUrl: z.url().nullable(),
  /** Proveedor que sirvió la noticia. */
  provider: z.string(),
})
export type NewsItem = z.infer<typeof newsItemSchema>
