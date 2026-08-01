import { z } from 'zod'
import type {
  CalendarEvent,
  CompanyProfile,
  Instrument,
  Quote,
  ScreenerRow,
} from '@shared/domain'
import { getMarketState } from '@shared/market/session'
import { isCanonicalSymbol, isEquityLike } from '@shared/market/symbols'
import { AppError } from '../../ipc/app-error'
import { fetchJson } from '../http'
import type { MarketDataProvider } from '../types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Financial Modeling Prep
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ficha de empresa y cotización de renta variable. Su valor frente a Finnhub
 * está en el perfil: sector, industria, consejero delegado, descripción, beta,
 * PER, BPA y rango de 52 semanas — todo lo que necesita la página de activo.
 *
 * **Importante sobre la URL base:** los endpoints `/api/v3/` están retirados y
 * responden 403 aunque la clave sea válida. Hay que usar `/stable/`. Es el tipo
 * de detalle que cuesta una tarde si no queda escrito.
 */

const BASE_URL = 'https://financialmodelingprep.com/stable'
export const FMP_PROVIDER_ID = 'fmp'

const quoteSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable().optional(),
  price: z.number().nullable(),
  change: z.number().nullable().optional(),
  changePercentage: z.number().nullable().optional(),
  dayLow: z.number().nullable().optional(),
  dayHigh: z.number().nullable().optional(),
  open: z.number().nullable().optional(),
  previousClose: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  yearLow: z.number().nullable().optional(),
  yearHigh: z.number().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  pe: z.number().nullable().optional(),
  eps: z.number().nullable().optional(),
  exchange: z.string().nullable().optional(),
  timestamp: z.number().nullable().optional(),
})

const profileSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  beta: z.number().nullable().optional(),
  lastDividend: z.number().nullable().optional(),
  range: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  exchangeFullName: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  ceo: z.string().nullable().optional(),
  fullTimeEmployees: z.union([z.string(), z.number()]).nullable().optional(),
  website: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  ipoDate: z.string().nullable().optional(),
  isEtf: z.boolean().nullable().optional(),
})

/**
 * Ratios TTM.
 *
 * Aquí viven el PER y el BPA, no en `/quote`. El sufijo `TTM` significa
 * *trailing twelve months*: los últimos doce meses móviles, que es la base
 * habitual para estos múltiplos.
 */
const ratiosSchema = z.object({
  priceToEarningsRatioTTM: z.number().nullable().optional(),
  netIncomePerShareTTM: z.number().nullable().optional(),
  dividendYieldTTM: z.number().nullable().optional(),
})

const dividendCalendarSchema = z.object({
  symbol: z.string(),
  /** Fecha ex-dividendo. */
  date: z.string(),
  paymentDate: z.string().nullable().optional(),
  dividend: z.number().nullable().optional(),
  adjDividend: z.number().nullable().optional(),
})

const moverSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable().optional(),
  price: z.number().nullable(),
  changesPercentage: z.number().nullable().optional(),
})

/** Preajustes de renta variable disponibles en el plan gratuito. */
const MOVERS_ENDPOINT: Readonly<Record<string, string | undefined>> = {
  gainers: '/biggest-gainers',
  losers: '/biggest-losers',
  actives: '/most-actives',
}

/** Códigos de mercado estadounidenses tal como los devuelve FMP. */
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'NYSE ARCA', 'BATS', 'OTC'])

const searchSchema = z.array(
  z.object({
    symbol: z.string(),
    name: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    exchange: z.string().nullable().optional(),
  }),
)

function toUrlOrNull(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

/** FMP devuelve el rango anual como texto `"201.5-334.2"`. */
function parseRange(range: string | null | undefined): { low: number | null; high: number | null } {
  if (!range) return { low: null, high: null }
  const [low, high] = range.split('-').map((part) => Number(part.trim()))
  return {
    low: Number.isFinite(low) ? (low ?? null) : null,
    high: Number.isFinite(high) ? (high ?? null) : null,
  }
}

/** El número de empleados llega unas veces como número y otras como cadena. */
function parseEmployees(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value.replace(/[^0-9]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

export function createFmpProvider(getKey: () => string | null): MarketDataProvider {
  const requireKey = (): string => {
    const key = getKey()
    if (!key) throw new AppError('MISSING_CREDENTIAL', 'Falta la clave de API de FMP.')
    return key
  }

  const buildUrl = (path: string, params: Record<string, string>): string => {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    url.searchParams.set('apikey', requireKey())
    return url.toString()
  }

  return {
    id: FMP_PROVIDER_ID,
    displayName: 'Financial Modeling Prep',
    requiresApiKey: true,
    rateLimit: { capacity: 20, refillPerSecond: 0.5 },
    docsUrl: 'https://site.financialmodelingprep.com/developer/docs',

    // Su plan gratuito son ~250 peticiones AL DÍA: servir cotizaciones con él
    // agotaría la cuota en minutos. Se reserva para la ficha de empresa, que se
    // pide pocas veces y donde es claramente el mejor.
    capabilityPriorityOffset: { quote: 100, search: 100 },

    supports: (capability, query) => {
      // La búsqueda y el calendario no van dirigidos a un símbolo concreto.
      if (capability === 'search' || capability === 'earningsCalendar') return true
      if (capability === 'screener') return (query as { assetClass?: string }).assetClass === 'stock'
      const symbol = (query as { symbol?: string }).symbol
      return typeof symbol === 'string' && isEquityLike(symbol)
    },

    methods: {
      quote: async ({ symbol }): Promise<Quote> => {
        const raw = await fetchJson({
          url: buildUrl('/quote', { symbol: symbol.toUpperCase() }),
          provider: 'FMP',
        })

        const parsed = z.array(quoteSchema).safeParse(raw)
        const data = parsed.success ? parsed.data[0] : undefined
        if (!data || data.price === null) {
          throw new AppError('NOT_FOUND', `FMP no tiene cotización de ${symbol}.`)
        }

        return {
          symbol: data.symbol.toUpperCase(),
          price: data.price,
          change: data.change ?? 0,
          changePercent: data.changePercentage ?? 0,
          previousClose: data.previousClose ?? null,
          open: data.open ?? null,
          dayHigh: data.dayHigh ?? null,
          dayLow: data.dayLow ?? null,
          volume: data.volume ?? null,
          marketState: getMarketState(new Date()),
          extendedPrice: null,
          extendedChangePercent: null,
          currency: 'USD',
          timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
          source: FMP_PROVIDER_ID,
        }
      },

      profile: async ({ symbol }): Promise<CompanyProfile> => {
        const upper = symbol.toUpperCase()

        /**
         * Tres llamadas en paralelo porque FMP reparte la ficha en tres sitios:
         *
         *  - `/profile`   descripción, sector, consejero delegado, beta.
         *  - `/quote`     rango anual y capitalización.
         *  - `/ratios-ttm` PER y BPA — **no** están en `/quote` pese a lo que
         *    sugiere su nombre; buscarlos ahí es lo que dejaba esos dos campos
         *    vacíos en la ficha.
         *
         * Las dos secundarias se capturan por separado: si fallan, la ficha se
         * muestra igual con lo que haya en lugar de no mostrarse.
         */
        const [profileRaw, quoteRaw, ratiosRaw] = await Promise.all([
          fetchJson({ url: buildUrl('/profile', { symbol: upper }), provider: 'FMP' }),
          fetchJson({ url: buildUrl('/quote', { symbol: upper }), provider: 'FMP' }).catch(
            () => null,
          ),
          fetchJson({ url: buildUrl('/ratios-ttm', { symbol: upper }), provider: 'FMP' }).catch(
            () => null,
          ),
        ])

        const parsed = z.array(profileSchema).safeParse(profileRaw)
        const data = parsed.success ? parsed.data[0] : undefined
        if (!data) throw new AppError('NOT_FOUND', `FMP no tiene ficha de ${symbol}.`)

        const quoteParsed = z.array(quoteSchema).safeParse(quoteRaw)
        const quote = quoteParsed.success ? quoteParsed.data[0] : undefined

        const ratiosParsed = z.array(ratiosSchema).safeParse(ratiosRaw)
        const ratios = ratiosParsed.success ? ratiosParsed.data[0] : undefined

        const range = parseRange(data.range)
        const ipo = data.ipoDate ? Date.parse(data.ipoDate) : Number.NaN

        return {
          symbol: data.symbol.toUpperCase(),
          name: data.companyName ?? data.symbol,
          assetClass: data.isEtf === true ? 'etf' : 'stock',
          exchange: data.exchangeFullName ?? data.exchange ?? null,
          currency: data.currency ?? null,
          country: data.country ?? null,
          sector: data.sector ?? null,
          industry: data.industry ?? null,
          description: data.description ?? null,
          ceo: data.ceo ?? null,
          employees: parseEmployees(data.fullTimeEmployees),
          website: toUrlOrNull(data.website),
          logoUrl: toUrlOrNull(data.image),
          marketCap: data.marketCap ?? quote?.marketCap ?? null,
          sharesOutstanding: null,
          ipoDate: Number.isNaN(ipo) ? null : ipo,
          peRatio: ratios?.priceToEarningsRatioTTM ?? null,
          eps: ratios?.netIncomePerShareTTM ?? null,
          // Se prefiere la rentabilidad que da FMP directamente; si no la trae,
          // se deriva del último dividendo. El cálculo exige precio positivo:
          // dividir por un precio ausente daría `Infinity` y se mostraría como
          // una rentabilidad absurda.
          dividendYield:
            ratios?.dividendYieldTTM != null
              ? ratios.dividendYieldTTM * 100
              : data.lastDividend && data.price && data.price > 0
                ? (data.lastDividend / data.price) * 100
                : null,
          beta: data.beta ?? null,
          weekLow52: range.low ?? quote?.yearLow ?? null,
          weekHigh52: range.high ?? quote?.yearHigh ?? null,
          source: FMP_PROVIDER_ID,
        }
      },

      /**
       * Dividendos del calendario.
       *
       * FMP aporta lo que Finnhub no tiene. Sus endpoints de OPVs y de
       * calendario económico responden 402 en el plan gratuito, así que aquí
       * solo se implementan los dividendos y, si acaso, resultados como
       * respaldo de Finnhub.
       */
      earningsCalendar: async ({ from, to, kinds }): Promise<readonly CalendarEvent[]> => {
        if (kinds.length > 0 && !kinds.includes('dividend')) return []

        const range = {
          from: new Date(from).toISOString().slice(0, 10),
          to: new Date(to).toISOString().slice(0, 10),
        }

        const raw = await fetchJson({
          url: buildUrl('/dividends-calendar', range),
          provider: 'FMP',
        })

        const parsed = z.array(dividendCalendarSchema).safeParse(raw)
        if (!parsed.success) return []

        return parsed.data.flatMap((row): CalendarEvent[] => {
          const date = Date.parse(row.date)
          if (Number.isNaN(date) || !isCanonicalSymbol(row.symbol)) return []

          const payment = row.paymentDate ? Date.parse(row.paymentDate) : Number.NaN

          return [
            {
              id: `dividend:${row.symbol}:${row.date}`,
              kind: 'dividend',
              symbol: row.symbol.toUpperCase(),
              name: null,
              date,
              timing: null,
              epsEstimate: null,
              epsActual: null,
              revenueEstimate: null,
              revenueActual: null,
              amount: row.dividend ?? row.adjDividend ?? null,
              // La fecha de pago no coincide con la ex-dividendo: son dos
              // conceptos distintos y mezclarlos induce a error.
              paymentDate: Number.isNaN(payment) ? null : payment,
              exchange: null,
              priceRange: null,
              shares: null,
              source: FMP_PROVIDER_ID,
            },
          ]
        })
      },

      /**
       * Movimientos del mercado.
       *
       * Son datos de **mercado completo**, no de una muestra: FMP publica las
       * mayores subidas, bajadas y valores más negociados de toda la sesión.
       *
       * No hay screener con filtros libres (capitalización, PER, sector): ese
       * endpoint responde 402 en el plan gratuito. Ofrecer preajustes que
       * funcionan es preferible a un formulario que devolvería un error de
       * suscripción.
       */
      screener: async ({ assetClass, preset, limit }): Promise<readonly ScreenerRow[]> => {
        if (assetClass !== 'stock') return []

        const endpoint = MOVERS_ENDPOINT[preset]
        if (!endpoint) return []

        const raw = await fetchJson({ url: buildUrl(endpoint, {}), provider: 'FMP' })
        const parsed = z.array(moverSchema).safeParse(raw)
        if (!parsed.success) return []

        return parsed.data
          .filter((row) => isCanonicalSymbol(row.symbol) && row.price !== null)
          .slice(0, limit)
          .map(
            (row): ScreenerRow => ({
              symbol: row.symbol.toUpperCase(),
              name: row.name ?? row.symbol,
              assetClass: 'stock',
              price: row.price ?? 0,
              changePercent: row.changesPercentage ?? 0,
              // Estos endpoints no traen capitalización ni volumen; `null` dice
              // «no lo aporta», que es distinto de cero.
              marketCap: null,
              volume: null,
              rank: null,
              source: FMP_PROVIDER_ID,
            }),
          )
      },

      search: async ({ text, limit }): Promise<readonly Instrument[]> => {
        const raw = await fetchJson({
          url: buildUrl('/search-symbol', { query: text }),
          provider: 'FMP',
        })

        const parsed = searchSchema.safeParse(raw)
        if (!parsed.success) return []

        return parsed.data
          // Solo mercados estadounidenses: son los únicos que los proveedores
          // configurados saben cotizar. FMP devuelve también listados de
          // Ámsterdam, Bombay o Sao Paulo, que la aplicación no puede abrir.
          .filter((item) => US_EXCHANGES.has((item.exchange ?? '').toUpperCase()))
          .slice(0, limit)
          .map(
          (item): Instrument => ({
            symbol: item.symbol.toUpperCase(),
            name: item.name ?? item.symbol,
            assetClass: 'stock',
            exchange: item.exchange ?? null,
            currency: item.currency ?? null,
          }),
        )
      },
    },
  }
}
