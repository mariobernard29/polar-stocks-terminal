import { z } from 'zod'
import { symbolSchema } from './instrument'

/**
 * Marcos temporales soportados.
 *
 * Se distingue `m` (minutos) de `M` (meses) por mayúscula, igual que la
 * convención de TradingView, para no tener que traducir en el adaptador de
 * gráficos.
 */
export const timeframeSchema = z.enum([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1D',
  '1W',
  '1M',
])
export type Timeframe = z.infer<typeof timeframeSchema>

/** Vela OHLCV. `time` es epoch en milisegundos (UTC) del inicio del periodo. */
export const candleSchema = z.object({
  time: z.number().int(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  /** `null` cuando el proveedor no informa volumen (habitual en forex e índices). */
  volume: z.number().nullable(),
})
export type Candle = z.infer<typeof candleSchema>

export const candleSeriesSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
  candles: z.array(candleSchema),
  source: z.string(),
})
export type CandleSeries = z.infer<typeof candleSeriesSchema>
