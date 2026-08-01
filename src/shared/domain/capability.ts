import { z } from 'zod'

/**
 * Lo que la aplicación sabe *hacer*, no de quién lo obtiene.
 *
 * Toda la UI se programa contra capacidades, nunca contra nombres de
 * proveedor. Es lo que convierte «si una API no está configurada, la app sigue
 * funcionando con las demás» en una propiedad de la arquitectura en vez de un
 * `if` repartido por veinte componentes.
 */
export const capabilitySchema = z.enum([
  'quote',
  'historical',
  'profile',
  'fundamentals',
  'news',
  'search',
  'earningsCalendar',
  'economicCalendar',
  'screener',
  'cryptoQuote',
  'cryptoMetrics',
  'forex',
  'commodities',
  'realtimeStream',
])
export type Capability = z.infer<typeof capabilitySchema>

export const CAPABILITIES = capabilitySchema.options

/**
 * - `available`   — hay al menos un proveedor configurado y sano.
 * - `degraded`    — hay proveedor, pero limitado (cuota agotada, plan
 *                   gratuito sin tiempo real, fallback en uso).
 * - `unavailable` — ningún proveedor configurado la ofrece.
 *
 * `degraded` existe porque la alternativa —mentir diciendo `available` y
 * servir datos con 15 minutos de retraso sin avisar— es inaceptable en una
 * herramienta con la que alguien decide dónde pone su dinero.
 */
export const capabilityStateSchema = z.enum(['available', 'degraded', 'unavailable'])
export type CapabilityState = z.infer<typeof capabilityStateSchema>

export const capabilityStatusSchema = z.object({
  capability: capabilitySchema,
  state: capabilityStateSchema,
  /** Proveedor que la está sirviendo ahora mismo, si hay alguno. */
  provider: z.string().nullable(),
  /** Motivo legible cuando el estado no es `available`. Se muestra en la UI. */
  reason: z.string().nullable(),
})
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>
