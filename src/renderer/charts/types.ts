import type { ComponentType } from 'react'
import type { Timeframe } from '@shared/domain'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ChartAdapter
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El panel de gráfico no sabe quién dibuja. Esta interfaz es lo que permite
 * cambiar de motor sin tocar el panel, la barra de marcos temporales ni el
 * sistema de disposiciones.
 *
 * Hoy hay dos implementaciones y está previsto un tercero:
 *
 *  - `native` — velas SVG con nuestros propios datos. Funciona sin conexión y
 *    sin terceros, y es el respaldo cuando TradingView no está disponible.
 *  - `tradingview` — widget oficial embebido por iframe.
 *  - *Advanced Charts* — el motor completo de TradingView, que exige solicitar
 *    acceso a su repositorio privado. Cuando esté, se añade aquí como una
 *    tercera entrada y nada más del proyecto cambia.
 */

export interface ChartProps {
  readonly symbol: string
  readonly timeframe: Timeframe
  /** Mercado, si se conoce. Ayuda a desambiguar el símbolo en TradingView. */
  readonly exchange?: string | null
}

export interface ChartAdapter {
  readonly id: string
  /** Clave de traducción bajo `charts.`. */
  readonly labelKey: string
  /** Si necesita red y carga contenido de terceros. */
  readonly requiresNetwork: boolean
  readonly Component: ComponentType<ChartProps>
}
