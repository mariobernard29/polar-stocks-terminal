import { lazy, type ComponentType } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { BarChart3, ListChecks, Newspaper, type LucideIcon } from 'lucide-react'
import { z } from 'zod'
import { symbolSchema, timeframeSchema } from '@shared/domain'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Registro de paneles
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fuente única de lo que puede vivir dentro del espacio de trabajo. Añadir un
 * panel nuevo en el futuro es añadir una entrada aquí: el menú de "nuevo panel",
 * el mapa de componentes de dockview y la validación de parámetros salen todos
 * de este objeto.
 *
 * Cada panel declara un esquema de sus parámetros por un motivo concreto: los
 * parámetros se serializan dentro del layout guardado, y un layout guardado hace
 * un año puede contener parámetros de una versión anterior del panel. Validar al
 * restaurar evita que un panel viejo rompa toda la disposición.
 *
 * Los componentes se cargan de forma diferida: un layout con doce paneles no
 * debe arrastrar el código de los doce al arranque.
 */

const chartParamsSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
})

const watchlistParamsSchema = z.object({
  symbols: z.array(symbolSchema).min(1).max(50),
})

const newsParamsSchema = z.object({
  symbol: symbolSchema.nullable(),
})

export interface PanelDefinition {
  readonly type: string
  /** Clave de traducción bajo `panels.` */
  readonly titleKey: string
  readonly icon: LucideIcon
  readonly paramsSchema: z.ZodType
  readonly defaultParams: Record<string, unknown>
  readonly component: ComponentType<IDockviewPanelProps>
}

const ChartPanel = lazy(() =>
  import('./ChartPanel').then((module) => ({ default: module.ChartPanel })),
)
const WatchlistPanel = lazy(() =>
  import('./WatchlistPanel').then((module) => ({ default: module.WatchlistPanel })),
)
const NewsPanel = lazy(() =>
  import('./NewsPanel').then((module) => ({ default: module.NewsPanel })),
)

export const PANEL_REGISTRY: Readonly<Record<string, PanelDefinition>> = {
  chart: {
    type: 'chart',
    titleKey: 'chart',
    icon: BarChart3,
    paramsSchema: chartParamsSchema,
    defaultParams: { symbol: 'AAPL', timeframe: '1D' },
    component: ChartPanel,
  },
  watchlist: {
    type: 'watchlist',
    titleKey: 'watchlist',
    icon: ListChecks,
    paramsSchema: watchlistParamsSchema,
    defaultParams: { symbols: ['AAPL', 'MSFT', 'NVDA', 'BTC', 'ETH', '^GSPC'] },
    component: WatchlistPanel,
  },
  news: {
    type: 'news',
    titleKey: 'news',
    icon: Newspaper,
    paramsSchema: newsParamsSchema,
    defaultParams: { symbol: null },
    component: NewsPanel,
  },
}

export const PANEL_TYPES = Object.keys(PANEL_REGISTRY)

/**
 * Valida los parámetros de un panel al restaurar un layout.
 *
 * Si no encajan (panel de una versión anterior, tipo desconocido) devuelve los
 * valores por defecto en lugar de fallar: perder la configuración de un panel es
 * mucho menos grave que perder la disposición entera.
 */
export function resolvePanelParams(type: string, params: unknown): Record<string, unknown> {
  const definition = PANEL_REGISTRY[type]
  if (!definition) return {}

  const parsed = definition.paramsSchema.safeParse(params)
  return parsed.success
    ? (parsed.data as Record<string, unknown>)
    : { ...definition.defaultParams }
}
