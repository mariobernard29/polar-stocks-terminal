import { z } from 'zod'
import type {
  Candle,
  CandleSeries,
  CryptoMetrics,
  Instrument,
  Quote,
  ScreenerRow,
} from '@shared/domain'
import { inferAssetClass } from '@shared/market/symbols'
import { AppError } from '../../ipc/app-error'
import { fetchJson } from '../http'
import type { MarketDataProvider } from '../types'
import { cacheCoinId, getCachedCoinId, getStaticCoinId, SYMBOL_BY_COIN_ID } from './coin-ids'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CoinGecko
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Criptomonedas: cotización, histórico, búsqueda y métricas (supply,
 * dominancia, máximos históricos).
 *
 * **Solo sirve cripto.** Declina cualquier otra clase de activo por el mismo
 * motivo por el que Finnhub declina cripto: devolver algo con el símbolo
 * correcto pero el activo equivocado es peor que no devolver nada.
 *
 * Plan demo: unas 30 llamadas por minuto.
 */

const BASE_URL = 'https://api.coingecko.com/api/v3'
export const COINGECKO_PROVIDER_ID = 'coingecko'

const marketEntrySchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  image: z.string().nullable().optional(),
  current_price: z.number().nullable(),
  market_cap: z.number().nullable(),
  market_cap_rank: z.number().nullable(),
  total_volume: z.number().nullable(),
  high_24h: z.number().nullable(),
  low_24h: z.number().nullable(),
  price_change_24h: z.number().nullable(),
  price_change_percentage_24h: z.number().nullable(),
  circulating_supply: z.number().nullable(),
  total_supply: z.number().nullable(),
  max_supply: z.number().nullable(),
  ath: z.number().nullable(),
  ath_date: z.string().nullable(),
  atl: z.number().nullable(),
  last_updated: z.string().nullable(),
})

const searchResponseSchema = z.object({
  coins: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      symbol: z.string(),
      market_cap_rank: z.number().nullable(),
      thumb: z.string().optional(),
    }),
  ),
})

/** `/ohlc` devuelve tuplas `[epoch_ms, open, high, low, close]`, sin volumen. */
const ohlcSchema = z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]))

const globalSchema = z.object({
  data: z.object({
    market_cap_percentage: z.record(z.string(), z.number()),
  }),
})

function toUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

/**
 * Días de histórico que pedir para cubrir `limit` velas.
 *
 * `/ohlc` no acepta un número de velas: acepta días, y decide la granularidad
 * por su cuenta (≤2 días → 30 min, ≤30 días → 4 h, más → 4 días). Se traduce el
 * marco temporal pedido al número de días que produce aproximadamente esa
 * cantidad de velas.
 */
function daysFor(timeframe: string, limit: number): number {
  const perDay: Record<string, number> = {
    '1m': 48, '5m': 48, '15m': 48, '30m': 48, '1h': 6, '4h': 6, '1D': 1, '1W': 1 / 7, '1M': 1 / 30,
  }
  const rate = perDay[timeframe] ?? 1
  return Math.min(365, Math.max(1, Math.ceil(limit / rate)))
}

export function createCoinGeckoProvider(getKey: () => string | null): MarketDataProvider {
  /**
   * La clave demo es opcional: sin ella CoinGecko sigue respondiendo, pero con
   * un límite mucho más bajo. Se añade cuando está.
   */
  const buildUrl = (path: string, params: Record<string, string> = {}): string => {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const key = getKey()
    if (key) url.searchParams.set('x_cg_demo_api_key', key)
    return url.toString()
  }

  const requireCrypto = (symbol: string): void => {
    if (inferAssetClass(symbol) !== 'crypto') {
      throw new AppError('NOT_FOUND', `CoinGecko solo cubre criptomonedas, y ${symbol} no lo es.`)
    }
  }

  /** Traduce símbolo → id, con el mapa estático primero y `/search` después. */
  const resolveCoinId = async (symbol: string): Promise<string> => {
    const upper = symbol.toUpperCase()

    const known = getStaticCoinId(upper) ?? getCachedCoinId(upper)
    if (known) return known

    const raw = await fetchJson({
      url: buildUrl('/search', { query: upper }),
      provider: 'CoinGecko',
    })
    const parsed = searchResponseSchema.safeParse(raw)

    // Coincidencia exacta de símbolo y, entre varias, la de mayor
    // capitalización: es la desambiguación que el mapa estático evita para las
    // monedas principales.
    const match = parsed.success
      ? parsed.data.coins
          .filter((coin) => coin.symbol.toUpperCase() === upper)
          .sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999))[0]
      : undefined

    if (!match) {
      throw new AppError('NOT_FOUND', `CoinGecko no conoce la criptomoneda ${symbol}.`)
    }

    cacheCoinId(upper, match.id)
    return match.id
  }

  const fetchMarket = async (symbol: string): Promise<z.infer<typeof marketEntrySchema>> => {
    requireCrypto(symbol)
    const coinId = await resolveCoinId(symbol)

    const raw = await fetchJson({
      url: buildUrl('/coins/markets', {
        vs_currency: 'usd',
        ids: coinId,
        price_change_percentage: '24h,7d,30d',
      }),
      provider: 'CoinGecko',
    })

    const parsed = z.array(marketEntrySchema).safeParse(raw)
    const entry = parsed.success ? parsed.data[0] : undefined
    if (!entry || entry.current_price === null) {
      throw new AppError('NOT_FOUND', `CoinGecko no tiene precio para ${symbol}.`)
    }
    return entry
  }

  const toQuote = (entry: z.infer<typeof marketEntrySchema>, symbol: string): Quote => ({
    symbol: symbol.toUpperCase(),
    price: entry.current_price ?? 0,
    change: entry.price_change_24h ?? 0,
    changePercent: entry.price_change_percentage_24h ?? 0,
    previousClose:
      entry.current_price !== null && entry.price_change_24h !== null
        ? entry.current_price - entry.price_change_24h
        : null,
    // `/coins/markets` no da apertura del día.
    open: null,
    dayHigh: entry.high_24h,
    dayLow: entry.low_24h,
    volume: entry.total_volume,
    // Las criptomonedas no cierran.
    marketState: 'open',
    extendedPrice: null,
    extendedChangePercent: null,
    currency: 'USD',
    timestamp: entry.last_updated ? Date.parse(entry.last_updated) : Date.now(),
    source: COINGECKO_PROVIDER_ID,
  })

  return {
    id: COINGECKO_PROVIDER_ID,
    displayName: 'CoinGecko',
    // Funciona sin clave, con menos cuota. Se marca como no obligatoria para que
    // la aplicación pueda dar cripto real nada más instalarse.
    requiresApiKey: false,
    rateLimit: { capacity: 15, refillPerSecond: 0.4 },
    docsUrl: 'https://www.coingecko.com/en/developers/dashboard',

    /**
     * `search` sirve para cualquier texto —el usuario puede estar buscando una
     * moneda por nombre—, pero el resto de capacidades exigen un símbolo de
     * criptomoneda. Filtrarlo aquí evita gastar cuota en una petición que
     * `requireCrypto` iba a rechazar de todos modos.
     */
    supports: (capability, query) => {
      if (capability === 'search') return true
      // El screener lleva la clase de activo en la propia consulta.
      if (capability === 'screener') return (query as { assetClass?: string }).assetClass === 'crypto'
      const symbol = (query as { symbol?: string }).symbol
      return typeof symbol === 'string' && inferAssetClass(symbol) === 'crypto'
    },

    methods: {
      quote: async ({ symbol }) => toQuote(await fetchMarket(symbol), symbol),
      cryptoQuote: async ({ symbol }) => toQuote(await fetchMarket(symbol), symbol),

      search: async ({ text, limit }): Promise<readonly Instrument[]> => {
        const raw = await fetchJson({
          url: buildUrl('/search', { query: text }),
          provider: 'CoinGecko',
        })
        const parsed = searchResponseSchema.safeParse(raw)
        if (!parsed.success) return []

        return parsed.data.coins
          .sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999))
          .slice(0, limit)
          .map(
            (coin): Instrument => ({
              symbol: coin.symbol.toUpperCase(),
              name: coin.name,
              assetClass: 'crypto',
              exchange: null,
              currency: 'USD',
            }),
          )
      },

      historical: async ({ symbol, timeframe, limit }): Promise<CandleSeries> => {
        requireCrypto(symbol)
        const coinId = await resolveCoinId(symbol)

        const raw = await fetchJson({
          url: buildUrl(`/coins/${coinId}/ohlc`, {
            vs_currency: 'usd',
            days: String(daysFor(timeframe, limit)),
          }),
          provider: 'CoinGecko',
        })

        const parsed = ohlcSchema.safeParse(raw)
        if (!parsed.success) {
          throw new AppError('NOT_FOUND', `CoinGecko no tiene histórico de ${symbol}.`)
        }

        const candles: Candle[] = parsed.data
          // Se toman las últimas `limit`: CoinGecko devuelve el rango entero de
          // días pedido, que puede ser mayor.
          .slice(-limit)
          .map(([time, open, high, low, close]) => ({
            time,
            open,
            high,
            low,
            close,
            // `/ohlc` no incluye volumen. `null` es «no lo ofrece», no cero.
            volume: null,
          }))

        return { symbol: symbol.toUpperCase(), timeframe, candles, source: COINGECKO_PROVIDER_ID }
      },

      /**
       * Screener de criptomonedas.
       *
       * A diferencia de la renta variable, aquí sí hay ordenación de mercado
       * completo en el plan gratuito: `/coins/markets` acepta orden por
       * capitalización o volumen y devuelve la variación de 24 horas, así que
       * las subidas y bajadas se calculan sobre el universo ordenado por
       * capitalización en lugar de sobre una muestra.
       */
      screener: async ({ assetClass, preset, limit }): Promise<readonly ScreenerRow[]> => {
        if (assetClass !== 'crypto') return []

        const raw = await fetchJson({
          url: buildUrl('/coins/markets', {
            vs_currency: 'usd',
            order: preset === 'actives' ? 'volume_desc' : 'market_cap_desc',
            // Se piden 250 y se ordena localmente para subidas y bajadas:
            // CoinGecko no ofrece orden por variación, y hacerlo sobre las 250
            // mayores da un resultado con sentido — ordenar sobre las 18.000
            // monedas listadas devolvería tokens sin liquidez.
            per_page: String(preset === 'gainers' || preset === 'losers' ? 250 : limit),
            page: '1',
          }),
          provider: 'CoinGecko',
        })

        const parsed = z.array(marketEntrySchema).safeParse(raw)
        if (!parsed.success) return []

        const rows = parsed.data
          .filter((entry) => entry.current_price !== null)
          .map(
            (entry): ScreenerRow => ({
              symbol: entry.symbol.toUpperCase(),
              name: entry.name,
              assetClass: 'crypto',
              price: entry.current_price ?? 0,
              changePercent: entry.price_change_percentage_24h ?? 0,
              marketCap: entry.market_cap,
              volume: entry.total_volume,
              rank: entry.market_cap_rank,
              source: COINGECKO_PROVIDER_ID,
            }),
          )

        if (preset === 'gainers') rows.sort((a, b) => b.changePercent - a.changePercent)
        if (preset === 'losers') rows.sort((a, b) => a.changePercent - b.changePercent)

        return rows.slice(0, limit)
      },

      cryptoMetrics: async ({ symbol }): Promise<CryptoMetrics> => {
        const entry = await fetchMarket(symbol)

        // La dominancia no está en `/coins/markets`: vive en `/global`. Si esa
        // segunda llamada falla, se devuelve el resto en lugar de perder todas
        // las métricas por un campo.
        let dominance: number | null = null
        try {
          const raw = await fetchJson({ url: buildUrl('/global'), provider: 'CoinGecko' })
          const parsed = globalSchema.safeParse(raw)
          if (parsed.success) {
            dominance = parsed.data.data.market_cap_percentage[entry.symbol.toLowerCase()] ?? null
          }
        } catch {
          dominance = null
        }

        return {
          symbol: (SYMBOL_BY_COIN_ID[entry.id] ?? entry.symbol).toUpperCase(),
          name: entry.name,
          price: entry.current_price ?? 0,
          marketCap: entry.market_cap,
          marketCapRank: entry.market_cap_rank,
          volume24h: entry.total_volume,
          circulatingSupply: entry.circulating_supply,
          totalSupply: entry.total_supply,
          maxSupply: entry.max_supply,
          dominance,
          allTimeHigh: entry.ath,
          allTimeHighDate: entry.ath_date ? Date.parse(entry.ath_date) : null,
          allTimeLow: entry.atl,
          change24h: entry.price_change_percentage_24h,
          // El endpoint acepta pedir 7d y 30d, pero los devuelve en campos con
          // nombre dinámico; se dejan para la ficha de cripto de la Fase 3.
          change7d: null,
          change30d: null,
          logoUrl: toUrlOrNull(entry.image),
          source: COINGECKO_PROVIDER_ID,
        }
      },
    },
  }
}
