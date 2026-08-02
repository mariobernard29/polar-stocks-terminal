import { useTranslation } from 'react-i18next'
import { PolarError } from '@shared/ipc/error-codes'

/**
 * Estados de carga y error compartidos por todos los paneles.
 *
 * Centralizado a propósito: si cada panel inventara su propio mensaje de error,
 * la terminal daría una sensación distinta según dónde falle. Además aquí se
 * usa el código del error para decidir si tiene sentido ofrecer "reintentar" —
 * volver a intentar una credencial ausente solo frustra.
 */
export function PanelState({
  isLoading,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean
  error: unknown
  onRetry?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-content-muted">
        {t('common.loading')}
      </div>
    )
  }

  if (error) {
    const polar = error instanceof PolarError ? error : null
    const canRetry = polar ? polar.retryable : true

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="max-w-xs text-xs leading-relaxed text-content-secondary">
          {polar?.message ?? String(error)}
        </p>
        {polar?.details && <p className="text-[11px] text-content-muted">{polar.details}</p>}
        {canRetry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-panel border border-edge px-3 py-1 text-xs text-content-secondary transition-colors duration-120 hover:border-edge-strong hover:text-content"
          >
            {t('common.retry')}
          </button>
        )}
      </div>
    )
  }

  return <>{children}</>
}
