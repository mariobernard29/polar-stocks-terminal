import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { NewsCategory, NewsItem } from '@shared/domain'
import { AppError } from '../../ipc/app-error'
import { fetchJson } from '../http'
import type { MarketDataProvider } from '../types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NewsAPI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Titulares generales de mercado, economía y tecnología. Complementa a Finnhub,
 * que cubre bien las noticias de empresa pero es más pobre en temas amplios.
 *
 * Se registra con prioridad inferior a Finnhub para noticias de un símbolo
 * concreto, y es la fuente principal cuando la categoría es macro o tecnología.
 *
 * Aviso del plan gratuito: NewsAPI limita el uso a desarrollo y devuelve
 * artículos con hasta 24 horas de retraso.
 */

const BASE_URL = 'https://newsapi.org/v2'
export const NEWSAPI_PROVIDER_ID = 'newsapi'

const responseSchema = z.object({
  status: z.string(),
  articles: z
    .array(
      z.object({
        source: z.object({ id: z.string().nullable(), name: z.string() }),
        title: z.string().nullable(),
        description: z.string().nullable(),
        url: z.string(),
        urlToImage: z.string().nullable(),
        publishedAt: z.string(),
      }),
    )
    .optional(),
})

/** Consultas por categoría. NewsAPI busca por texto, no por taxonomía nuestra. */
const CATEGORY_QUERIES: Readonly<Record<string, string>> = {
  economy: 'economy OR inflation OR "central bank" OR GDP',
  technology: 'technology OR semiconductor OR software',
  ai: '"artificial intelligence" OR "machine learning" OR OpenAI OR Anthropic',
  crypto: 'crypto OR bitcoin OR ethereum OR blockchain',
  market: 'stock market OR equities OR "S&P 500" OR Nasdaq',
}

/**
 * Dominios que no publican noticias.
 *
 * Buscar términos de inteligencia artificial devolvía entradas de `pypi.org`
 * —publicaciones de paquetes de Python como `genkit-plugin-anthropic 0.9.0`—
 * mezcladas con titulares reales. Son páginas legítimas, pero no son noticias, y
 * en una sección de noticias solo hacen ruido.
 *
 * Los agregadores como Biztoc se excluyen por otro motivo: republican textos de
 * otros medios, así que producen duplicados del mismo titular con otra firma.
 */
const EXCLUDED_DOMAINS = [
  'pypi.org',
  'npmjs.com',
  'github.com',
  'gitlab.com',
  'biztoc.com',
  'removed.com',
]

/**
 * Descarta titulares repetidos.
 *
 * La misma noticia llega desde varios medios con diferencias mínimas de
 * puntuación o mayúsculas. Se normaliza antes de comparar; si no, «AI slop» y
 * «'AI slop'» pasarían por titulares distintos.
 */
function deduplicateByHeadline(): (item: NewsItem) => boolean {
  const seen = new Set<string>()

  return (item) => {
    const key = item.headline
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (seen.has(key)) return false
    seen.add(key)
    return true
  }
}

function toUrlOrNull(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

/**
 * Identificador determinista derivado de la URL.
 *
 * NewsAPI no da id propio, y el id tiene que ser estable entre ejecuciones para
 * poder marcar favoritos y deduplicar la misma noticia llegada por dos
 * proveedores distintos.
 */
function stableId(url: string): string {
  return `newsapi-${createHash('sha1').update(url).digest('hex').slice(0, 16)}`
}

export function createNewsApiProvider(getKey: () => string | null): MarketDataProvider {
  const requireKey = (): string => {
    const key = getKey()
    if (!key) throw new AppError('MISSING_CREDENTIAL', 'Falta la clave de API de NewsAPI.')
    return key
  }

  return {
    id: NEWSAPI_PROVIDER_ID,
    displayName: 'NewsAPI',
    requiresApiKey: true,
    rateLimit: { capacity: 10, refillPerSecond: 0.2 },
    docsUrl: 'https://newsapi.org/account',

    methods: {
      news: async ({ symbol, category, limit }): Promise<readonly NewsItem[]> => {
        const url = new URL(`${BASE_URL}/everything`)

        // Con símbolo se busca por el ticker; con categoría, por su consulta
        // temática; sin nada, titulares de mercado.
        const query = symbol
          ? `"${symbol.toUpperCase()}"`
          : (CATEGORY_QUERIES[category ?? 'market'] ?? CATEGORY_QUERIES['market'] ?? 'markets')

        url.searchParams.set('q', query)
        url.searchParams.set('language', 'en')
        url.searchParams.set('sortBy', 'publishedAt')
        url.searchParams.set('excludeDomains', EXCLUDED_DOMAINS.join(','))
        // Se piden de más porque después se descartan duplicados y ruido; sin
        // margen, filtrar dejaría la lista más corta de lo pedido.
        url.searchParams.set('pageSize', String(Math.min(100, limit * 2)))
        url.searchParams.set('apiKey', requireKey())

        const raw = await fetchJson({ url: url.toString(), provider: 'NewsAPI' })
        const parsed = responseSchema.safeParse(raw)
        if (!parsed.success || !parsed.data.articles) return []

        return parsed.data.articles
          .map((article): NewsItem | null => {
            const link = toUrlOrNull(article.url)
            // Sin titular o sin enlace, la noticia no sirve de nada. NewsAPI
            // devuelve artículos retirados con `title: "[Removed]"`.
            if (!link || !article.title || article.title === '[Removed]') return null

            return {
              id: stableId(link),
              headline: article.title,
              summary: article.description,
              url: link,
              source: article.source.name,
              publishedAt: Date.parse(article.publishedAt),
              symbols: symbol ? [symbol.toUpperCase()] : [],
              category: (category ?? (symbol ? 'company' : 'market')) as NewsCategory,
              imageUrl: toUrlOrNull(article.urlToImage),
              provider: NEWSAPI_PROVIDER_ID,
            }
          })
          .filter((item): item is NewsItem => item !== null)
          .filter(deduplicateByHeadline())
          .slice(0, limit)
      },
    },
  }
}
