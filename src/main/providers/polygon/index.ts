import { z } from 'zod'
import type { CandleSeries } from '@shared/domain'
import { isEquityLike } from '@shared/market/symbols'
import { AppError } from '../../ipc/app-error'
import { fetchJson } from '../http'
import type { MarketDataProvider } from '../types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Polygon.io
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Históricos de renta variable. Es la pieza que faltaba: Finnhub no sirve
 * `/stock/candle` en plan gratuito, así que sin Polygon los gráficos de acciones
 * seguirían siendo simulados.
 *
 * Plan gratuito: 5 llamadas por minuto y datos con retraso. El límite es
 * agresivo, así que el TTL de caché de `historical` (una hora) hace aquí más
 * trabajo que en ningún otro proveedor.
 */

const BASE_URL = 'https://api.polygon.io'
export const POLYGON_PROVIDER_ID = 'polygon'

const aggregatesSchema = z.object({
  ticker: z.string().optional(),
  results: z
    .array(
      z.object({
        t: z.number(), // epoch ms del inicio de la vela
        o: z.number(),
        h: z.number(),
        l: z.number(),
        c: z.number(),
        v: z.number().optional(),
      }),
    )
    .optional(),
  resultsCount: z.number().optional(),
  status: z.string().optional(),
})

/** Traducción del marco temporal de la aplicación al par (multiplicador, unidad). */
const TIMEFRAME_MAP: Readonly<Record<string, { multiplier: number; timespan: string; ms: number }>> =
  {
    '1m': { multiplier: 1, timespan: 'minute', ms: 60_000 },
    '5m': { multiplier: 5, timespan: 'minute', ms: 300_000 },
    '15m': { multiplier: 15, timespan: 'minute', ms: 900_000 },
    '30m': { multiplier: 30, timespan: 'minute', ms: 1_800_000 },
    '1h': { multiplier: 1, timespan: 'hour', ms: 3_600_000 },
    '4h': { multiplier: 4, timespan: 'hour', ms: 14_400_000 },
    '1D': { multiplier: 1, timespan: 'day', ms: 86_400_000 },
    '1W': { multiplier: 1, timespan: 'week', ms: 604_800_000 },
    '1M': { multiplier: 1, timespan: 'month', ms: 2_592_000_000 },
  }

const isoDay = (at: Date): string => at.toISOString().slice(0, 10)

export function createPolygonProvider(getKey: () => string | null): MarketDataProvider {
  const requireKey = (): string => {
    const key = getKey()
    if (!key) throw new AppError('MISSING_CREDENTIAL', 'Falta la clave de API de Polygon.')
    return key
  }

  return {
    id: POLYGON_PROVIDER_ID,
    displayName: 'Polygon.io',
    requiresApiKey: true,
    // 5 llamadas/minuto en el plan gratuito. Ráfaga corta y reposición lenta.
    rateLimit: { capacity: 5, refillPerSecond: 0.08 },
    docsUrl: 'https://polygon.io/dashboard/api-keys',

    supports: (_capability, query) => {
      const symbol = (query as { symbol?: string }).symbol
      return typeof symbol === 'string' && isEquityLike(symbol)
    },

    methods: {
      historical: async ({ symbol, timeframe, limit }): Promise<CandleSeries> => {
        const spec = TIMEFRAME_MAP[timeframe] ?? TIMEFRAME_MAP['1D']
        if (!spec) throw new AppError('NOT_FOUND', `Marco temporal no soportado: ${timeframe}.`)

        // Se pide con holgura porque los días sin sesión (fines de semana y
        // festivos) no producen vela: pedir exactamente `limit` días naturales
        // devolvería bastantes menos velas de las pedidas.
        const span = spec.ms * limit * 1.6
        const to = new Date()
        const from = new Date(to.getTime() - span)

        const url = new URL(
          `${BASE_URL}/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}` +
            `/range/${spec.multiplier}/${spec.timespan}/${isoDay(from)}/${isoDay(to)}`,
        )
        url.searchParams.set('adjusted', 'true')
        url.searchParams.set('sort', 'asc')
        url.searchParams.set('limit', String(Math.min(5000, limit * 2)))
        url.searchParams.set('apiKey', requireKey())

        const raw = await fetchJson({ url: url.toString(), provider: 'Polygon' })
        const parsed = aggregatesSchema.safeParse(raw)

        const results = parsed.success ? (parsed.data.results ?? []) : []
        if (results.length === 0) {
          throw new AppError('NOT_FOUND', `Polygon no tiene histórico de ${symbol}.`)
        }

        return {
          symbol: symbol.toUpperCase(),
          timeframe,
          // Las últimas `limit`: se pidió de más para compensar días sin sesión.
          candles: results.slice(-limit).map((bar) => ({
            time: bar.t,
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v ?? null,
          })),
          source: POLYGON_PROVIDER_ID,
        }
      },
    },
  }
}
