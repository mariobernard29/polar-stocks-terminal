import { z } from 'zod'
import { assetClassSchema, symbolSchema } from './instrument'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Alertas
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Solo hay dos tipos: precio y variación porcentual. El esquema de la base de
 * datos admite además `volume`, `news` e `indicator`, pero no se ofrecen, y no
 * por falta de tiempo:
 *
 * - **Volumen**: el flujo de Finnhub trae el volumen *de cada operación*, no el
 *   acumulado de la sesión. Una alerta de «volumen por encima de X» construida
 *   sobre eso saltaría con cualquier orden grande suelta y no significaría lo
 *   que el usuario cree.
 * - **Noticias**: exigiría sondear el endpoint de noticias por símbolo de forma
 *   continua. Con los límites del plan gratuito, cinco alertas agotarían la
 *   cuota diaria antes del mediodía.
 * - **Indicadores**: requieren la serie histórica en cada evaluación, que es
 *   precisamente lo que el plan gratuito de Finnhub deniega con 403.
 *
 * Se dicen los tres motivos en la propia pantalla. Ofrecer un desplegable con
 * opciones que no funcionan sería peor que no ofrecerlas.
 */

export const alertKindSchema = z.enum(['price', 'changePercent'])
export type AlertKind = z.infer<typeof alertKindSchema>

export const alertConditionSchema = z.enum(['above', 'below'])
export type AlertCondition = z.infer<typeof alertConditionSchema>

export const alertSchema = z.object({
  id: z.string(),
  symbol: symbolSchema,
  assetClass: assetClassSchema,
  kind: alertKindSchema,
  condition: alertConditionSchema,
  threshold: z.number(),
  enabled: z.boolean(),
  /** Si se desactiva sola tras dispararse una vez. */
  once: z.boolean(),
  createdAt: z.number().int(),
  /** Último disparo, si lo hubo. Epoch ms. */
  lastTriggeredAt: z.number().int().nullable(),
})
export type AlertRecord = z.infer<typeof alertSchema>

export const alertInputSchema = z.object({
  symbol: symbolSchema,
  assetClass: assetClassSchema,
  kind: alertKindSchema,
  condition: alertConditionSchema,
  // Finito y acotado: un umbral `NaN` no se cumpliría nunca y el usuario vería
  // una alerta que simplemente no funciona, sin ningún error que lo explique.
  threshold: z.number().finite().min(-1e12).max(1e12),
  once: z.boolean().default(true),
})
export type AlertInput = z.infer<typeof alertInputSchema>

export const alertTriggerSchema = z.object({
  id: z.string(),
  alertId: z.string(),
  symbol: symbolSchema,
  kind: alertKindSchema,
  condition: alertConditionSchema,
  threshold: z.number(),
  /** Valor observado que provocó el disparo. */
  value: z.number().nullable(),
  message: z.string(),
  triggeredAt: z.number().int(),
  acknowledged: z.boolean(),
})
export type AlertTriggerRecord = z.infer<typeof alertTriggerSchema>
