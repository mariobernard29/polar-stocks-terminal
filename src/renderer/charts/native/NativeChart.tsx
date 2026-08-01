import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { Candle } from '@shared/domain'
import { PanelState } from '../../panels/PanelState'
import { ipc } from '../../lib/ipc'
import type { ChartProps } from '../types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Gráfico propio
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Velas en SVG dibujadas con **nuestros** datos, los mismos que alimentan el
 * resto de la aplicación.
 *
 * No es el motor principal, pero tampoco es un juguete: es el único que
 * funciona sin conexión, el único que no carga contenido de terceros y el único
 * que garantiza que lo que se ve coincide exactamente con lo que muestran los
 * demás paneles. Por eso se queda aunque TradingView esté disponible.
 */
export function NativeChart({ symbol, timeframe }: ChartProps): React.JSX.Element {
  const { t } = useTranslation()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['historical', symbol, timeframe],
    queryFn: () => ipc.market.historical({ symbol, timeframe, limit: 120 }),
  })

  return (
    <PanelState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
      {data && data.candles.length > 0 ? (
        <Candlesticks candles={data.candles} />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-content-muted">
          {t('common.noData')}
        </div>
      )}
    </PanelState>
  )
}

/**
 * Velas en SVG con `viewBox`, sin medir el contenedor.
 *
 * Es lo que permite que el gráfico se redimensione con el panel sin escuchar
 * eventos de resize ni volver a renderizar: el navegador escala el vector. En un
 * espacio de trabajo donde el usuario arrastra divisores constantemente, eso es
 * la diferencia entre fluido y entrecortado.
 */
function Candlesticks({ candles }: { candles: readonly Candle[] }): React.JSX.Element {
  const geometry = useMemo(() => {
    const max = Math.max(...candles.map((c) => c.high))
    const min = Math.min(...candles.map((c) => c.low))
    // Un 4 % de margen evita que la vela más alta toque el borde superior.
    const padding = (max - min) * 0.04 || 1
    const top = max + padding
    const bottom = min - padding
    const range = top - bottom

    const width = 1000
    const height = 400
    const slot = width / candles.length
    const bodyWidth = Math.max(1, slot * 0.6)

    const y = (value: number): number => ((top - value) / range) * height

    return {
      width,
      height,
      bodyWidth,
      bars: candles.map((candle, index) => ({
        x: index * slot + slot / 2,
        yHigh: y(candle.high),
        yLow: y(candle.low),
        yOpen: y(candle.open),
        yClose: y(candle.close),
        rising: candle.close >= candle.open,
      })),
    }
  }, [candles])

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      className="size-full"
      role="img"
      aria-label="Gráfico de velas"
    >
      {geometry.bars.map((bar, index) => {
        const color = bar.rising ? 'var(--polar-positive)' : 'var(--polar-negative)'
        const bodyTop = Math.min(bar.yOpen, bar.yClose)
        // Altura mínima de 1: una vela con apertura y cierre iguales debe verse.
        const bodyHeight = Math.max(1, Math.abs(bar.yClose - bar.yOpen))

        return (
          <g key={index}>
            <line
              x1={bar.x}
              x2={bar.x}
              y1={bar.yHigh}
              y2={bar.yLow}
              stroke={color}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={bar.x - geometry.bodyWidth / 2}
              y={bodyTop}
              width={geometry.bodyWidth}
              height={bodyHeight}
              fill={color}
            />
          </g>
        )
      })}
    </svg>
  )
}
