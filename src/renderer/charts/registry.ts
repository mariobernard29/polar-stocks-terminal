import { NativeChart } from './native/NativeChart'
import { TradingViewChart } from './tradingview/TradingViewChart'
import type { ChartAdapter } from './types'

/**
 * Motores de gráfico disponibles.
 *
 * Añadir *Advanced Charts* cuando se consiga acceso al repositorio privado de
 * TradingView será una entrada más en este objeto: el panel, la barra de marcos
 * temporales y las disposiciones guardadas no se enteran.
 */
export const CHART_ADAPTERS: Readonly<Record<string, ChartAdapter>> = {
  tradingview: {
    id: 'tradingview',
    labelKey: 'tradingview',
    requiresNetwork: true,
    Component: TradingViewChart,
  },
  native: {
    id: 'native',
    labelKey: 'native',
    requiresNetwork: false,
    Component: NativeChart,
  },
}

export const DEFAULT_CHART_ADAPTER = 'tradingview'

export function getChartAdapter(id: string | undefined): ChartAdapter {
  return CHART_ADAPTERS[id ?? DEFAULT_CHART_ADAPTER] ?? CHART_ADAPTERS['native']!
}
