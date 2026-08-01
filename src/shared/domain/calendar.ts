import { z } from 'zod'
import { symbolSchema } from './instrument'

/**
 * Evento del calendario corporativo.
 *
 * Un único tipo con discriminador en vez de tres tipos separados: la vista de
 * calendario los mezcla en la misma línea temporal, y tenerlos separados
 * obligaría a unificarlos en el renderer con tres ramas en cada punto.
 *
 * Los campos que no aplican a un tipo son `null`, no cero. Un dividendo no
 * tiene beneficio por acción estimado, y decir que vale cero sería falso.
 */
export const calendarEventKindSchema = z.enum(['earnings', 'dividend', 'ipo'])
export type CalendarEventKind = z.infer<typeof calendarEventKindSchema>

export const calendarEventSchema = z.object({
  /** Identificador determinista: `tipo:símbolo:fecha`. Permite deduplicar. */
  id: z.string(),
  kind: calendarEventKindSchema,
  symbol: symbolSchema,
  name: z.string().nullable(),
  /** Fecha del evento, epoch ms UTC. */
  date: z.number().int(),

  // ─── Resultados ───────────────────────────────────────────────────────────
  /** Momento de la sesión: antes de abrir, tras el cierre, o desconocido. */
  timing: z.enum(['bmo', 'amc', 'unknown']).nullable(),
  epsEstimate: z.number().nullable(),
  epsActual: z.number().nullable(),
  revenueEstimate: z.number().nullable(),
  revenueActual: z.number().nullable(),

  // ─── Dividendos ───────────────────────────────────────────────────────────
  /** Importe por acción. */
  amount: z.number().nullable(),
  /** Fecha de pago, que no coincide con la fecha ex-dividendo. */
  paymentDate: z.number().int().nullable(),

  // ─── OPVs ─────────────────────────────────────────────────────────────────
  exchange: z.string().nullable(),
  /** Rango de precios orientativo, tal como lo publica el proveedor. */
  priceRange: z.string().nullable(),
  shares: z.number().nullable(),

  source: z.string(),
})
export type CalendarEvent = z.infer<typeof calendarEventSchema>

export const calendarQuerySchema = z.object({
  /** Rango de fechas, epoch ms. */
  from: z.number().int(),
  to: z.number().int(),
  /** Tipos a incluir. Vacío significa todos. */
  kinds: z.array(calendarEventKindSchema).default([]),
})
export type CalendarQuery = z.infer<typeof calendarQuerySchema>
