import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { Quote } from '@shared/domain'
import { useRealtimeQuotes } from '../../hooks/use-realtime'
import { ipc } from '../../lib/ipc'
import { formatCompact, formatPercent, formatPrice, formatRelative } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Panel principal
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Resumen de mercado: índices, criptomonedas, mayores movimientos y titulares.
 *
 * Los grupos son fijos y cortos a propósito. Un panel que pide cien símbolos al
 * abrirse agota la cuota de un plan gratuito en dos aperturas, y además tarda
 * tanto en pintarse que deja de ser un resumen.
 */

const INDICES = ['^GSPC', '^IXIC', '^DJI'] as const
const CRYPTO = ['BTC', 'ETH', 'SOL'] as const
const MOVERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM'] as const

export function DashboardPage(): React.JSX.Element {
  const { t } = useTranslation()

  const allSymbols = useMemo(() => [...INDICES, ...CRYPTO, ...MOVERS], [])
  useRealtimeQuotes(allSymbols)

  const results = useQueries({
    queries: allSymbols.map((symbol) => ({
      queryKey: ['quote', symbol],
      queryFn: () => ipc.market.quote(symbol),
      // Los índices y las acciones sin flujo se refrescan solos; el resto llega
      // por WebSocket.
      refetchInterval: 60_000,
      retry: false,
    })),
  })

  const quoteFor = (symbol: string): Quote | undefined =>
    results[allSymbols.indexOf(symbol as (typeof allSymbols)[number])]?.data

  /**
   * Mayores subidas y bajadas de la muestra.
   *
   * Es una muestra fija, no un screener del mercado entero: eso exige un
   * endpoint de *gainers/losers* que ninguno de los proveedores gratuitos
   * configurados ofrece. Se dice claramente en el título para no aparentar una
   * cobertura que no hay.
   */
  const movers = useMemo(() => {
    const quotes = MOVERS.map(quoteFor).filter((quote): quote is Quote => quote !== undefined)
    const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent)
    return { gainers: sorted.slice(0, 4), losers: sorted.slice(-4).reverse() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  const news = useQuery({
    queryKey: ['news', null],
    queryFn: () => ipc.market.news({ symbol: null, category: null, limit: 8 }),
    retry: false,
  })

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-3">
        <SectionTitle>{t('dashboard.indices')}</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {INDICES.map((symbol) => (
            <QuoteCard key={symbol} symbol={symbol} quote={quoteFor(symbol)} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('dashboard.crypto')}</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {CRYPTO.map((symbol) => (
            <QuoteCard key={symbol} symbol={symbol} quote={quoteFor(symbol)} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-6">
        <MoverList
          title={t('dashboard.gainers')}
          icon={TrendingUp}
          tone="positive"
          quotes={movers.gainers}
        />
        <MoverList
          title={t('dashboard.losers')}
          icon={TrendingDown}
          tone="negative"
          quotes={movers.losers}
        />
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t('dashboard.headlines')}</SectionTitle>
        <ul className="divide-y divide-edge rounded-panel border border-edge bg-surface">
          {news.data?.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void ipc.app.openExternal(item.url)}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-elevated"
              >
                <span className="text-xs leading-snug text-content">{item.headline}</span>
                <span className="flex gap-2 text-[10px] text-content-muted">
                  <span>{item.source}</span>
                  <span>·</span>
                  <RelativeTime at={item.publishedAt} />
                </span>
              </button>
            </li>
          ))}
          {news.data?.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-content-muted">
              {t('common.noData')}
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h2 className="text-xs font-medium uppercase tracking-wide text-content-muted">{children}</h2>
  )
}

function RelativeTime({ at }: { at: number }): React.JSX.Element {
  const { i18n } = useTranslation()
  return <span>{formatRelative(new Date(at), i18n.language)}</span>
}

function QuoteCard({ symbol, quote }: { symbol: string; quote: Quote | undefined }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const positive = (quote?.changePercent ?? 0) >= 0

  return (
    <button
      type="button"
      onClick={() => void navigate(`/activo/${encodeURIComponent(symbol)}`)}
      className="flex flex-col gap-1 rounded-panel border border-edge bg-surface p-4 text-left transition-colors duration-120 hover:border-edge-strong"
    >
      <span className="text-xs text-content-muted">{symbol}</span>

      {quote ? (
        <>
          <span className="tabular text-lg font-medium text-content">
            {formatPrice(quote.price, quote.currency, i18n.language)}
          </span>
          <span
            className={cn('tabular text-xs', positive ? 'text-positive' : 'text-negative')}
          >
            {formatPercent(quote.changePercent, i18n.language)}
          </span>
        </>
      ) : (
        <span className="text-sm text-content-muted">{t('common.loading')}</span>
      )}
    </button>
  )
}

function MoverList({
  title,
  icon: Icon,
  tone,
  quotes,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'positive' | 'negative'
  quotes: readonly Quote[]
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  return (
    <section className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-5">
      <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-content-muted">
        <Icon className={cn('size-3.5', tone === 'positive' ? 'text-positive' : 'text-negative')} />
        {title}
      </h2>

      {quotes.length === 0 ? (
        <p className="text-xs text-content-muted">{t('common.loading')}</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {quotes.map((quote) => (
              <tr
                key={quote.symbol}
                onClick={() => void navigate(`/activo/${encodeURIComponent(quote.symbol)}`)}
                className="cursor-pointer border-t border-edge first:border-0 hover:bg-elevated"
              >
                <td className="py-1.5 text-content">{quote.symbol}</td>
                <td className="py-1.5 text-right tabular text-content-secondary">
                  {formatPrice(quote.price, quote.currency, i18n.language)}
                </td>
                <td className="py-1.5 text-right tabular text-content-muted">
                  {quote.volume !== null ? formatCompact(quote.volume, i18n.language) : '—'}
                </td>
                <td
                  className={cn(
                    'py-1.5 text-right tabular',
                    quote.changePercent >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {formatPercent(quote.changePercent, i18n.language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
