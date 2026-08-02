import { useQueries } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { IDockviewPanelProps } from 'dockview-react'
import type { Quote } from '@shared/domain'
import { ipc } from '../lib/ipc'
import { formatChange, formatPercent, formatPrice } from '../lib/format'
import { cn } from '../lib/cn'
import { useRealtimeQuotes } from '../hooks/use-realtime'

/**
 * Panel de lista de seguimiento.
 *
 * Una consulta independiente por símbolo, no una consulta con todos: así el
 * fallo de un símbolo no vacía la tabla entera, y la caché del registro
 * deduplica cuando dos paneles siguen el mismo activo. El coste real por
 * símbolo lo absorbe la caché del proceso main.
 */
export function WatchlistPanel(props: IDockviewPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const params = props.params as { symbols?: string[] }
  const symbols = params.symbols ?? []

  const { liveSymbols } = useRealtimeQuotes(symbols)

  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['quote', symbol],
      queryFn: () => ipc.market.quote(symbol),
      // Los símbolos con flujo en vivo se refrescan por WebSocket; el sondeo
      // solo cubre a los que no lo tienen. Sondear igualmente lo que ya llega
      // en tiempo real sería gastar cuota para no enterarse de nada nuevo.
      refetchInterval: liveSymbols.has(symbol) ? false : 30_000,
    })),
  })

  return (
    <div className="h-full overflow-auto bg-base">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-content-muted">
            <th className="px-3 py-2 text-left font-normal">{t('panels.columns.symbol')}</th>
            <th className="px-3 py-2 text-right font-normal">{t('panels.columns.price')}</th>
            <th className="px-3 py-2 text-right font-normal">{t('panels.columns.change')}</th>
            <th className="px-3 py-2 text-right font-normal">{t('panels.columns.changePct')}</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((symbol, index) => (
            <Row
              key={symbol}
              symbol={symbol}
              quote={results[index]?.data}
              isLoading={results[index]?.isLoading ?? false}
              hasError={results[index]?.isError ?? false}
              locale={i18n.language}
              isLive={liveSymbols.has(symbol)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  symbol,
  quote,
  isLoading,
  hasError,
  locale,
  isLive,
}: {
  symbol: string
  quote: Quote | undefined
  isLoading: boolean
  hasError: boolean
  locale: string
  isLive: boolean
}): React.JSX.Element {
  const { t } = useTranslation()

  if (isLoading || !quote) {
    return (
      <tr className="border-t border-edge">
        <td className="px-3 py-1.5 text-content">{symbol}</td>
        <td colSpan={3} className="px-3 py-1.5 text-right text-content-muted">
          {hasError ? t('common.noData') : t('common.loading')}
        </td>
      </tr>
    )
  }

  const positive = quote.changePercent >= 0
  const tone = positive ? 'text-positive' : 'text-negative'

  return (
    <tr className="border-t border-edge transition-colors duration-120 hover:bg-elevated">
      <td className="px-3 py-1.5 text-content">
        <span className="flex items-center gap-1.5">
          {symbol}
          {/*
            Punto verde solo si el precio llega de verdad en vivo. Marcar como
            «en directo» algo que se refresca cada 30 segundos sería engañoso, y
            no todos los activos admiten flujo: los índices no cotizan como tal.
          */}
          {isLive && (
            <span
              className="size-1 rounded-full bg-positive"
              title={t('panels.live')}
              aria-label={t('panels.live')}
            />
          )}
        </span>
      </td>
      <td className="tabular px-3 py-1.5 text-right text-content">
        {formatPrice(quote.price, quote.currency, locale)}
      </td>
      <td className={cn('tabular px-3 py-1.5 text-right', tone)}>
        {formatChange(quote.change, locale)}
      </td>
      <td className={cn('tabular px-3 py-1.5 text-right', tone)}>
        {formatPercent(quote.changePercent, locale)}
      </td>
    </tr>
  )
}
