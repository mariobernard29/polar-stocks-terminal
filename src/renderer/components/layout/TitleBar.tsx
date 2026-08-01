import { useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ipc, on } from '../../lib/ipc'
import { cn } from '../../lib/cn'

/**
 * Barra de título propia para la ventana sin marco.
 *
 * El estado de maximizado llega por evento desde el main, no se deduce aquí:
 * la ventana también se maximiza con doble clic en la barra o con los atajos
 * del sistema operativo, y en esos casos el renderer nunca se enteraría.
 */
export function WindowControls(): React.JSX.Element {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void ipc.window.isMaximized().then(setMaximized)
    return on('window:maximizedChanged', setMaximized)
  }, [])

  return (
    <div className="no-drag flex h-full items-stretch">
      <ControlButton label={t('window.minimize')} onClick={() => void ipc.window.minimize()}>
        <Minus className="size-3.5" />
      </ControlButton>

      <ControlButton
        label={maximized ? t('window.restore') : t('window.maximize')}
        onClick={() => void ipc.window.toggleMaximize()}
      >
        {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
      </ControlButton>

      <ControlButton
        label={t('window.close')}
        onClick={() => void ipc.window.close()}
        // El botón de cerrar es el único destructivo: se marca en rojo solo al
        // pasar por encima, para no llamar la atención permanentemente.
        className="hover:bg-negative hover:text-white"
      >
        <X className="size-3.5" />
      </ControlButton>
    </div>
  )
}

function ControlButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex w-11 items-center justify-center text-content-muted transition-colors duration-120',
        'hover:bg-overlay hover:text-content',
        className,
      )}
    >
      {children}
    </button>
  )
}
