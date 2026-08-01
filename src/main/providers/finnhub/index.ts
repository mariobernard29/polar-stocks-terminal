import { z } from 'zod'
import type {
  CalendarEvent,
  CompanyProfile,
  Instrument,
  NewsItem,
  Quote,
} from '@shared/domain'
import { getMarketState } from '@shared/market/session'
import { inferAssetClass, isCanonicalSymbol, isEquityLike } from '@shared/market/symbols'
import { AppError } from '../../ipc/app-error'
import { fetchJson } from '../http'
import type { MarketDataProvider } from '../types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Finnhub
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cotizaciones, búsqueda, noticias y perfil de empresa.
 *
 * **No implementa `historical` a propósito.** El endpoint `/stock/candle` exige
 * plan de pago y responde 403 en el gratuito. Como las capacidades se deducen de
 * los métodos presentes, no declararlo hace que el registro enrute los
 * históricos a otro proveedor automáticamente. Anunciarlo y fallar sería peor
 * que no ofrecerlo.
 *
 * Plan gratuito: 60 llamadas/minuto.
 */

const BASE_URL = 'https://finnhub.io/api/v1'
export const FINNHUB_PROVIDER_ID = 'finnhub'

/**
 * Las respuestas se validan con zod.
 *
 * No es ceremonia: un proveedor puede cambiar un campo, devolver `null` donde
 * antes había número, o responder 200 con un objeto de error. Sin validar, eso
 * se propaga hacia dentro como `undefined` y revienta tres capas más allá, lejos
 * del origen.
 */
const quoteResponseSchema = z.object({
  c: z.number(), // precio actual
  d: z.number().nullable(), // variación
  dp: z.number().nullable(), // variación porcentual
  h: z.number(), // máximo del día
  l: z.number(), // mínimo del día
  o: z.number(), // apertura
  pc: z.number(), // cierre anterior
  t: z.number(), // epoch en segundos
})

const searchResponseSchema = z.object({
  count: z.number(),
  result: z.array(
    z.object({
      description: z.string(),
      displaySymbol: z.string(),
      symbol: z.string(),
      type: z.string(),
    }),
  ),
})

const newsItemResponseSchema = z.object({
  category: z.string(),
  datetime: z.number(),
  headline: z.string(),
  id: z.number(),
  image: z.string(),
  related: z.string(),
  source: z.string(),
  summary: z.string(),
  url: z.string(),
})

const profileResponseSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  country: z.string().optional(),
  currency: z.string().optional(),
  exchange: z.string().optional(),
  ipo: z.string().optional(),
  marketCapitalization: z.number().optional(),
  shareOutstanding: z.number().optional(),
  logo: z.string().optional(),
  weburl: z.string().optional(),
  finnhubIndustry: z.string().optional(),
})

const earningsCalendarSchema = z.object({
  earningsCalendar: z.array(
    z.object({
      symbol: z.string(),
      date: z.string(),
      /** "bmo" antes de abrir, "amc" tras el cierre, vacío si no se sabe. */
      hour: z.string().optional(),
      epsEstimate: z.number().nullable().optional(),
      epsActual: z.number().nullable().optional(),
      revenueEstimate: z.number().nullable().optional(),
      revenueActual: z.number().nullable().optional(),
    }),
  ),
})

const ipoCalendarSchema = z.object({
  ipoCalendar: z.array(
    z.object({
      date: z.string(),
      symbol: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      exchange: z.string().nullable().optional(),
      price: z.string().nullable().optional(),
      numberOfShares: z.number().nullable().optional(),
    }),
  ),
})

/** Convierte la clasificación de Finnhub a nuestras clases de activo. */
function toAssetClass(type: string): Instrument['assetClass'] {
  const lower = type.toLowerCase()
  if (lower.includes('etf')) return 'etf'
  if (lower.includes('crypto')) return 'crypto'
  if (lower.includes('index')) return 'index'
  return 'stock'
}

/** URL válida o `null`. Finnhub devuelve cadena vacía cuando no tiene el dato. */
function toUrlOrNull(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

function buildUrl(path: string, params: Record<string, string>, token: string): string {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('token', token)
  return url.toString()
}

/** Fecha en `YYYY-MM-DD`, que es el formato que pide el endpoint de noticias. */
function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10)
}

export function createFinnhubProvider(getToken: () => string | null): MarketDataProvider {
  const requireToken = (): string => {
    const token = getToken()
    if (!token) {
      throw new AppError('MISSING_CREDENTIAL', 'Falta la clave de API de Finnhub.')
    }
    return token
  }

  return {
    id: FINNHUB_PROVIDER_ID,
    displayName: 'Finnhub',
    requiresApiKey: true,
    // 60 llamadas/minuto en el plan gratuito. Se deja margen: la ráfaga permite
    // abrir un layout con varios paneles de golpe sin agotar el minuto.
    rateLimit: { capacity: 30, refillPerSecond: 1 },
    docsUrl: 'https://finnhub.io/dashboard',

    // Su ficha de empresa es pobre (sin sector, ni consejero delegado, ni PER):
    // se cede esa capacidad a FMP si está configurado.
    capabilityPriorityOffset: { profile: 100 },

    /**
     * Solo renta variable. `search` y las noticias generales (sin símbolo) sí
     * valen para todo. Filtrar aquí evita gastar cuota en símbolos que este
     * proveedor va a declinar.
     */
    supports: (capability, query) => {
      if (capability === 'search' || capability === 'earningsCalendar') return true

      /**
       * Finnhub solo distingue entre noticias de empresa y titulares generales:
       * su endpoint no entiende categorías temáticas. Si se le pide «economía»
       * o «IA» devolvería titulares generales sin filtrar, que es exactamente
       * lo contrario de lo que pidió el usuario. Declinarlas hace que las sirva
       * NewsAPI, que sí busca por tema.
       */
      if (capability === 'news') {
        const category = (query as { category?: string | null }).category
        if (category !== null && category !== undefined && category !== 'company') return false
      }

      const symbol = (query as { symbol?: string | null }).symbol
      if (symbol === null || symbol === undefined) return true
      return isEquityLike(symbol)
    },

    methods: {
      quote: async ({ symbol }): Promise<Quote> => {
        // Finnhub solo sirve renta variable con este endpoint. `BTC` allí es el
        // ticker de una empresa cotizada, no Bitcoin: pedirlo devolvía 200 con
        // el precio de otra cosa y la aplicación lo mostraba como Bitcoin.
        // Declinar hace que el registro pase al siguiente proveedor.
        if (!isEquityLike(symbol)) {
          throw new AppError(
            'NOT_FOUND',
            `Finnhub no cubre ${symbol} (${inferAssetClass(symbol)}).`,
          )
        }

        const raw = await fetchJson(
          {
            url: buildUrl('/quote', { symbol }, requireToken()),
            provider: 'Finnhub',
          },
        )

        const parsed = quoteResponseSchema.safeParse(raw)
        if (!parsed.success) {
          throw new AppError('NOT_FOUND', `Finnhub no devolvió cotización para ${symbol}.`)
        }

        const data = parsed.data

        // Finnhub responde 200 con todo a cero para símbolos que no conoce.
        // Sin esta comprobación, la interfaz mostraría un activo a 0,00 US$ como
        // si fuera un dato real.
        if (data.c === 0 && data.pc === 0) {
          throw new AppError('NOT_FOUND', `Finnhub no conoce el símbolo ${symbol}.`)
        }

        return {
          symbol: symbol.toUpperCase(),
          price: data.c,
          change: data.d ?? 0,
          changePercent: data.dp ?? 0,
          previousClose: data.pc,
          open: data.o,
          dayHigh: data.h,
          dayLow: data.l,
          // El endpoint de cotización no incluye volumen.
          volume: null,
          marketState: getMarketState(new Date()),
          // Ni precio fuera de sesión: `null` es «no lo ofrece», no «cero».
          extendedPrice: null,
          extendedChangePercent: null,
          currency: 'USD',
          timestamp: data.t * 1000,
          source: FINNHUB_PROVIDER_ID,
        }
      },

      search: async ({ text, limit }): Promise<readonly Instrument[]> => {
        const raw = await fetchJson({
          url: buildUrl(
            '/search',
            {
              q: text,
              /**
               * Solo listados estadounidenses.
               *
               * Sin este filtro, buscar «shell» devolvía `SHELL.AS`, `SHEL.L` y
               * `002960.KS` — cotizaciones secundarias de Ámsterdam, Londres y
               * Seúl. El buscador las ofrecía y, al abrirlas, **ningún proveedor
               * configurado sabía darles precio**: acababan cayendo hasta el
               * simulado, que tampoco las tiene.
               *
               * Ofrecer un activo que la aplicación no puede cotizar es peor que
               * no ofrecerlo. Con el filtro, la misma búsqueda devuelve `SHEL`,
               * el ADR estadounidense, que sí se cotiza.
               *
               * Contrapartida asumida: una empresa no estadounidense buscada por
               * su nombre local no aparece. Cuando se añada un proveedor que
               * cubra esos mercados, se amplía aquí.
               */
              exchange: 'US',
            },
            requireToken(),
          ),
          provider: 'Finnhub',
        })

        const parsed = searchResponseSchema.safeParse(raw)
        if (!parsed.success) return []

        return parsed.data.result
          .slice(0, limit)
          .map(
            (item): Instrument => ({
              symbol: item.symbol.toUpperCase(),
              name: item.description,
              assetClass: toAssetClass(item.type),
              exchange: null,
              currency: null,
            }),
          )
      },

      news: async ({ symbol, limit }): Promise<readonly NewsItem[]> => {
        const token = requireToken()
        const now = new Date()

        // Sin símbolo, titulares generales; con símbolo, noticias de la empresa
        // de los últimos 30 días.
        const url = symbol
          ? buildUrl(
              '/company-news',
              {
                symbol,
                from: isoDate(new Date(now.getTime() - 30 * 24 * 3600_000)),
                to: isoDate(now),
              },
              token,
            )
          : buildUrl('/news', { category: 'general' }, token)

        const raw = await fetchJson({ url, provider: 'Finnhub' })
        const parsed = z.array(newsItemResponseSchema).safeParse(raw)
        if (!parsed.success) return []

        return parsed.data
          .slice(0, limit)
          .map((item): NewsItem | null => {
            const link = toUrlOrNull(item.url)
            // Sin enlace la noticia no se puede abrir; se descarta en lugar de
            // mostrar algo en lo que no se puede hacer clic.
            if (!link) return null

            return {
              id: `finnhub-${item.id}`,
              headline: item.headline,
              summary: item.summary.length > 0 ? item.summary : null,
              url: link,
              source: item.source,
              publishedAt: item.datetime * 1000,
              symbols: item.related
                .split(',')
                .map((value) => value.trim().toUpperCase())
                .filter((value) => value.length > 0),
              category: symbol ? 'company' : 'market',
              imageUrl: toUrlOrNull(item.image),
              provider: FINNHUB_PROVIDER_ID,
            }
          })
          .filter((item): item is NewsItem => item !== null)
      },

      /**
       * Calendario corporativo: resultados y salidas a bolsa.
       *
       * El calendario **económico** (inflación, PIB, FOMC) no se implementa
       * porque `/calendar/economic` responde 403 en el plan gratuito. Como las
       * capacidades se deducen de los métodos, `economicCalendar` queda sin
       * proveedor y la interfaz lo dice en vez de fingirlo.
       */
      earningsCalendar: async ({ from, to, kinds }): Promise<readonly CalendarEvent[]> => {
        const token = requireToken()
        const wants = (kind: CalendarEvent['kind']): boolean =>
          kinds.length === 0 || kinds.includes(kind)

        const range = { from: isoDate(new Date(from)), to: isoDate(new Date(to)) }

        // En paralelo: son endpoints independientes y encadenarlos duplicaría
        // la espera del calendario. Si uno falla, el otro sigue sirviendo.
        const [earningsRaw, iposRaw] = await Promise.all([
          wants('earnings')
            ? fetchJson({
                url: buildUrl('/calendar/earnings', range, token),
                provider: 'Finnhub',
              }).catch(() => null)
            : null,
          wants('ipo')
            ? fetchJson({ url: buildUrl('/calendar/ipo', range, token), provider: 'Finnhub' }).catch(
                () => null,
              )
            : null,
        ])

        const events: CalendarEvent[] = []

        const earnings = earningsCalendarSchema.safeParse(earningsRaw)
        if (earnings.success) {
          for (const row of earnings.data.earningsCalendar) {
            const date = Date.parse(row.date)
            // Finnhub cuela preferentes con espacios ("ICR PR A") que no encajan
            // en la forma canónica ni se pueden cotizar.
            if (Number.isNaN(date) || !isCanonicalSymbol(row.symbol)) continue

            events.push({
              id: `earnings:${row.symbol}:${row.date}`,
              kind: 'earnings',
              symbol: row.symbol.toUpperCase(),
              name: null,
              date,
              timing: row.hour === 'bmo' || row.hour === 'amc' ? row.hour : 'unknown',
              epsEstimate: row.epsEstimate ?? null,
              epsActual: row.epsActual ?? null,
              revenueEstimate: row.revenueEstimate ?? null,
              revenueActual: row.revenueActual ?? null,
              amount: null,
              paymentDate: null,
              exchange: null,
              priceRange: null,
              shares: null,
              source: FINNHUB_PROVIDER_ID,
            })
          }
        }

        const ipos = ipoCalendarSchema.safeParse(iposRaw)
        if (ipos.success) {
          for (const row of ipos.data.ipoCalendar) {
            const date = Date.parse(row.date)
            // Una OPV sin símbolo asignado todavía no se puede abrir ni seguir.
            if (Number.isNaN(date) || !row.symbol || !isCanonicalSymbol(row.symbol)) continue

            events.push({
              id: `ipo:${row.symbol}:${row.date}`,
              kind: 'ipo',
              symbol: row.symbol.toUpperCase(),
              name: row.name ?? null,
              date,
              timing: null,
              epsEstimate: null,
              epsActual: null,
              revenueEstimate: null,
              revenueActual: null,
              amount: null,
              paymentDate: null,
              exchange: row.exchange ?? null,
              priceRange: row.price ?? null,
              shares: row.numberOfShares ?? null,
              source: FINNHUB_PROVIDER_ID,
            })
          }
        }

        return events
      },

      profile: async ({ symbol }): Promise<CompanyProfile> => {
        if (!isEquityLike(symbol)) {
          throw new AppError('NOT_FOUND', `Finnhub no tiene ficha de ${symbol}.`)
        }

        const raw = await fetchJson({
          url: buildUrl('/stock/profile2', { symbol }, requireToken()),
          provider: 'Finnhub',
        })

        const parsed = profileResponseSchema.safeParse(raw)
        if (!parsed.success) {
          throw new AppError('NOT_FOUND', `Finnhub no tiene ficha de ${symbol}.`)
        }

        const data = parsed.data
        const ipo = data.ipo ? Date.parse(data.ipo) : Number.NaN

        return {
          symbol: data.ticker.toUpperCase(),
          name: data.name,
          assetClass: 'stock',
          exchange: data.exchange ?? null,
          currency: data.currency ?? null,
          country: data.country ?? null,
          // Finnhub da industria pero no sector; FMP sí, y tiene mayor prioridad
          // para esta capacidad.
          sector: null,
          industry: data.finnhubIndustry ?? null,
          description: null,
          ceo: null,
          employees: null,
          website: toUrlOrNull(data.weburl),
          logoUrl: toUrlOrNull(data.logo),
          // Finnhub expresa la capitalización en millones.
          marketCap:
            data.marketCapitalization !== undefined
              ? data.marketCapitalization * 1_000_000
              : null,
          sharesOutstanding:
            data.shareOutstanding !== undefined ? data.shareOutstanding * 1_000_000 : null,
          ipoDate: Number.isNaN(ipo) ? null : ipo,
          peRatio: null,
          eps: null,
          dividendYield: null,
          beta: null,
          weekLow52: null,
          weekHigh52: null,
          source: FINNHUB_PROVIDER_ID,
        }
      },
    },
  }
}
