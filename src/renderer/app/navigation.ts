import {
  Bell,
  CalendarDays,
  Filter,
  LayoutDashboard,
  LineChart,
  Newspaper,
  Settings,
  Star,
  Wallet,
  ListChecks,
  type LucideIcon,
  Sparkles,
} from 'lucide-react'

/**
 * Definición única de la navegación.
 *
 * De aquí salen a la vez la barra lateral, las rutas y los atajos de teclado.
 * Si estuvieran en tres sitios, acabarían discrepando: un atajo llevaría a una
 * ruta que la barra lateral ya no muestra.
 */
export interface NavigationItem {
  readonly id: string
  readonly path: string
  /** Clave de traducción bajo `nav.` */
  readonly labelKey: string
  readonly icon: LucideIcon
  /** Atajo global, si lo tiene. Se registra en el Bloque 7. */
  readonly shortcut?: string
  /** Fase en la que llega su contenido real. `null` = ya implementada. */
  readonly phase: 'phase2' | 'phase3' | 'phase4' | null
}

export const NAVIGATION: readonly NavigationItem[] = [
  {
    id: 'dashboard',
    path: '/',
    labelKey: 'dashboard',
    icon: LayoutDashboard,
    shortcut: 'Ctrl+Shift+D',
    phase: 'phase2',
  },
  {
    id: 'markets',
    path: '/mercados',
    labelKey: 'markets',
    icon: LineChart,
    shortcut: 'Ctrl+1',
    phase: 'phase2',
  },
  { id: 'watchlists', path: '/listas', labelKey: 'watchlists', icon: ListChecks, phase: 'phase2' },
  {
    id: 'news',
    path: '/noticias',
    labelKey: 'news',
    icon: Newspaper,
    shortcut: 'Ctrl+2',
    phase: 'phase3',
  },
  {
    id: 'calendar',
    path: '/calendario',
    labelKey: 'calendar',
    icon: CalendarDays,
    shortcut: 'Ctrl+3',
    phase: 'phase3',
  },
  { id: 'screeners', path: '/screeners', labelKey: 'screeners', icon: Filter, phase: 'phase3' },
  {
    id: 'portfolio',
    path: '/portafolio',
    labelKey: 'portfolio',
    icon: Wallet,
    shortcut: 'Ctrl+4',
    phase: 'phase4',
  },
  { id: 'alerts', path: '/alertas', labelKey: 'alerts', icon: Bell, phase: 'phase4' },
  { id: 'favorites', path: '/favoritos', labelKey: 'favorites', icon: Star, phase: 'phase2' },
  { id: 'ai', path: '/polar-ai', labelKey: 'ai', icon: Sparkles, phase: 'phase4' },
  {
    id: 'settings',
    path: '/configuracion',
    labelKey: 'settings',
    icon: Settings,
    shortcut: 'Ctrl+5',
    phase: null,
  },
]
