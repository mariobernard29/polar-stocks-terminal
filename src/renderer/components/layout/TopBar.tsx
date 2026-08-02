import { Search, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../assets/polar-logo.svg'
import { useCapabilities } from '../../hooks/use-capabilities'
import { useUiStore } from '../../stores/ui-store'
import { cn } from '../../lib/cn'
import { MarketClocks } from './MarketClocks'
import { WindowControls } from './TitleBar'

/**
 * Barra superior. Es también la zona de arrastre de la ventana sin marco: todo
 * lo interactivo lleva `no-drag`, o quedaría inservible.
 */
export function TopBar(): React.JSX.Element {
  const { t } = useTranslation()
  const openPalette = useUiStore((state) => state.setCommandPaletteOpen)

  return (
    <header className="drag-region flex h-11 shrink-0 items-center gap-4 border-b border-edge bg-surface pl-4">
      {/*
        El SVG es la variante para fondo oscuro (oso y «Polar» en blanco,
        «Stocks» en azul). El PNG del mismo logotipo es la variante para fondo
        claro y aquí resultaría ilegible.
      */}
      <img
        src={logoUrl}
        alt="Polar Stocks Terminal"
        className="h-5 w-auto shrink-0 select-none"
        draggable={false}
      />

      <button
        type="button"
        onClick={() => openPalette(true)}
        className="no-drag flex h-7 w-80 items-center gap-2 rounded-panel border border-edge bg-elevated px-3 text-left text-xs text-content-muted transition-colors duration-120 hover:border-edge-strong hover:text-content-secondary"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{t('common.searchPlaceholder')}</span>
        <kbd className="tabular shrink-0 rounded border border-edge px-1 text-[10px]">Ctrl K</kbd>
      </button>

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-5">
        <ConnectionStatus />
        <MarketClocks />
        <button
          type="button"
          aria-label="Perfil"
          className="flex size-7 items-center justify-center rounded-full border border-edge bg-elevated text-content-muted transition-colors duration-120 hover:border-edge-strong hover:text-content"
        >
          <User className="size-3.5" aria-hidden />
        </button>
      </div>

      <WindowControls />
    </header>
  )
}

/**
 * Estado de conexión expresado en funciones disponibles, no en "online/offline".
 *
 * Que haya red no significa que la terminal pueda hacer su trabajo: lo que le
 * importa al usuario es cuántas capacidades tiene realmente a mano.
 */
function ConnectionStatus(): React.JSX.Element {
  const { t } = useTranslation()
  const capabilities = useCapabilities()

  const total = capabilities.length
  const available = capabilities.filter((c) => c.state === 'available').length
  const degraded = capabilities.some((c) => c.state === 'degraded')

  const tone =
    available === 0 ? 'text-negative' : degraded ? 'text-warning' : 'text-content-secondary'

  return (
    <div
      className="flex items-center gap-2"
      title={t('connection.providersActive', { count: available, total })}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          available === 0 ? 'bg-negative' : degraded ? 'bg-warning' : 'bg-positive',
        )}
        aria-hidden
      />
      <span className={cn('tabular text-xs', tone)}>
        {available}/{total}
      </span>
    </div>
  )
}
