import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bell,
  CalendarDays,
  Command as CommandIcon,
  Copy,
  ListChecks,
  Maximize2,
  Newspaper,
  RotateCcw,
  Search,
  Settings,
  Wallet,
  X,
} from 'lucide-react'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo de comandos
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fuente única de lo que la aplicación sabe hacer. De aquí salen a la vez el
 * listado del buscador y el registro de atajos, así que un comando que aparece
 * en el buscador tiene garantizado el mismo atajo que muestra — no pueden
 * discrepar porque no son dos listas.
 *
 * El `scope` no es decorativo: distingue conflictos reales de contextos
 * excluyentes. `Escape` cierra el buscador cuando está abierto y cierra un panel
 * cuando no lo está, y eso no debe reportarse como colisión.
 */

export type CommandScope = 'global' | 'workspace' | 'palette'

export interface CommandDefinition {
  readonly id: string
  /** Clave de traducción bajo `commands.` */
  readonly labelKey: string
  readonly icon: LucideIcon
  readonly shortcut: string | null
  readonly scope: CommandScope
  /** Agrupación en el buscador. */
  readonly group: 'navigation' | 'workspace' | 'app'
}

export const COMMANDS: readonly CommandDefinition[] = [
  // Buscador
  { id: 'palette.open', labelKey: 'openSearch', icon: Search, shortcut: 'Ctrl+K', scope: 'global', group: 'app' },
  { id: 'palette.close', labelKey: 'closeSearch', icon: X, shortcut: 'Escape', scope: 'palette', group: 'app' },

  // Espacio de trabajo
  { id: 'workspace.newChart', labelKey: 'newChart', icon: BarChart3, shortcut: 'Ctrl+Shift+G', scope: 'global', group: 'workspace' },
  { id: 'workspace.newWatchlist', labelKey: 'newWatchlist', icon: ListChecks, shortcut: 'Ctrl+Shift+N', scope: 'global', group: 'workspace' },
  { id: 'workspace.newNews', labelKey: 'newNews', icon: Newspaper, shortcut: null, scope: 'global', group: 'workspace' },
  { id: 'workspace.duplicate', labelKey: 'duplicatePanel', icon: Copy, shortcut: null, scope: 'workspace', group: 'workspace' },
  { id: 'workspace.closePanel', labelKey: 'closePanel', icon: X, shortcut: 'Ctrl+W', scope: 'workspace', group: 'workspace' },
  { id: 'workspace.closePanelEsc', labelKey: 'closePanel', icon: X, shortcut: 'Escape', scope: 'workspace', group: 'workspace' },
  { id: 'workspace.reset', labelKey: 'resetLayout', icon: RotateCcw, shortcut: null, scope: 'workspace', group: 'workspace' },

  // Navegación
  { id: 'nav.dashboard', labelKey: 'goDashboard', icon: CommandIcon, shortcut: 'Ctrl+Shift+D', scope: 'global', group: 'navigation' },
  { id: 'nav.markets', labelKey: 'goMarkets', icon: BarChart3, shortcut: 'Ctrl+1', scope: 'global', group: 'navigation' },
  { id: 'nav.news', labelKey: 'goNews', icon: Newspaper, shortcut: 'Ctrl+2', scope: 'global', group: 'navigation' },
  { id: 'nav.calendar', labelKey: 'goCalendar', icon: CalendarDays, shortcut: 'Ctrl+3', scope: 'global', group: 'navigation' },
  { id: 'nav.portfolio', labelKey: 'goPortfolio', icon: Wallet, shortcut: 'Ctrl+4', scope: 'global', group: 'navigation' },
  { id: 'nav.settings', labelKey: 'goSettings', icon: Settings, shortcut: 'Ctrl+5', scope: 'global', group: 'navigation' },
  { id: 'nav.alerts', labelKey: 'goAlerts', icon: Bell, shortcut: null, scope: 'global', group: 'navigation' },

  // Ventana
  { id: 'app.fullscreen', labelKey: 'toggleFullscreen', icon: Maximize2, shortcut: 'F11', scope: 'global', group: 'app' },
]

/** Rutas a las que llevan los comandos de navegación. */
export const NAVIGATION_TARGETS: Readonly<Record<string, string>> = {
  'nav.dashboard': '/',
  'nav.markets': '/mercados',
  'nav.news': '/noticias',
  'nav.calendar': '/calendario',
  'nav.portfolio': '/portafolio',
  'nav.settings': '/configuracion',
  'nav.alerts': '/alertas',
}
