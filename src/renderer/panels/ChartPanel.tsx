import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { IDockviewPanelProps } from 'dockview-react'
import type { Timeframe } from '@shared/domain'
import { CHART_ADAPTERS, getChartAdapter } from '../charts/registry'
import { useSettings, useUpdateSettings } from '../hooks/use-settings'
import { ipc } from '../lib/ipc'
import { formatPercent, formatPrice } from '../lib/format'
import { cn } from '../lib/cn'
import { SymbolPicker } from './SymbolPicker'

const TIMEFRAMES: readonly Timeframe[] = ['1h', '4h', '1D', '1W', '1M']

/**
 * Panel de gráfico.
 *
 * No dibuja nada: elige un `ChartAdapter` y le pasa símbolo y marco temporal.
 * Cambiar de motor —o añadir Advanced Charts cuando haya acceso— no toca este
 * archivo.
 *
 * La cabecera sí es nuestra siempre: precio, variación y selector de marco
 * temporal se ven igual con cualquier motor, y el precio sale de la misma
 * cotización que el resto de la aplicación. Así el gráfico y la watchlist no
 * pueden mostrar cifras distintas del mismo activo.
 */
export function ChartPanel(props: IDockviewPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const updateSettings = useUpdateSettings()

  const params = props.params as { symbol?: string; timeframe?: Timeframe }
  const symbol = params.symbol ?? 'AAPL'
  const timeframe = params.timeframe ?? '1D'

  const adapterId = settings['appearance.chartProvider']
  const adapter = getChartAdapter(adapterId)

  // La cotización de cabecera es la misma consulta que usa la watchlist, así
  // que se sirve de caché y se actualiza en vivo por el mismo camino.
  const { data: quote } = useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => ipc.market.quote(symbol),
  })

  const setTimeframe = (next: Timeframe): void => {
    props.api.updateParameters({ ...params, timeframe: next })
  }

  /**
   * Cambia el activo del panel abierto.
   *
   * `updateParameters` y no un panel nuevo: así el usuario conserva su
   * disposición, y como los parámetros forman parte del layout serializado, el
   * símbolo elegido sobrevive al reinicio.
   *
   * El título se actualiza a la vez porque es lo que se lee en la pestaña; sin
   * eso, un gráfico de NVDA seguiría anunciándose como «Gráfico · AAPL».
   */
  const setSymbol = (next: string): void => {
    props.api.updateParameters({ ...params, symbol: next })
    props.api.setTitle(`${t('panels.chart')} · ${next}`)
  }

  return (
    <div className="flex h-full flex-col bg-base">
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-3 py-2">
        <SymbolPicker symbol={symbol} onSelect={setSymbol} />

        {quote && (
          <>
            <span className="tabular text-xs text-content-secondary">
              {formatPrice(quote.price, quote.currency, i18n.language)}
            </span>
            <span
              className={cn(
                'tabular text-xs',
                quote.changePercent >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {formatPercent(quote.changePercent, i18n.language)}
            </span>
          </>
        )}

        <div className="flex-1" />

        <div className="flex gap-0.5">
          {TIMEFRAMES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTimeframe(value)}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] transition-colors duration-120',
                value === timeframe
                  ? 'bg-accent-muted text-accent'
                  : 'text-content-muted hover:bg-elevated hover:text-content-secondary',
              )}
            >
              {value}
            </button>
          ))}
        </div>

        {/* Cambio rápido de motor, sin salir del panel. */}
        <select
          value={adapter.id}
          onChange={(event) =>
            void updateSettings({
              'appearance.chartProvider': event.target.value as 'tradingview' | 'native',
            })
          }
          aria-label={t('charts.engine')}
          className="rounded border border-edge bg-elevated px-1.5 py-0.5 text-[11px] text-content-muted outline-none hover:text-content focus:border-accent"
        >
          {Object.values(CHART_ADAPTERS).map((option) => (
            <option key={option.id} value={option.id}>
              {t(`charts.${option.labelKey}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1">
        <adapter.Component symbol={symbol} timeframe={timeframe} exchange={null} />
      </div>
    </div>
  )
}
