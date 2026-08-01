import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'

/**
 * Página de una sección cuyo contenido llega en una fase posterior.
 *
 * Dice explícitamente en qué fase llega en vez de mostrar una maqueta con datos
 * falsos. Una pantalla que aparenta funcionar y no funciona es peor que una
 * pantalla honesta: hace perder tiempo a quien la prueba.
 */
export function PlaceholderPage({
  icon: Icon,
  titleKey,
  descriptionKey,
  phaseKey,
}: {
  icon: LucideIcon
  titleKey: string
  descriptionKey: string
  phaseKey: 'phase2' | 'phase3' | 'phase4'
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-panel border border-edge bg-surface text-content-muted">
        <Icon className="size-5" aria-hidden />
      </div>

      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-lg font-medium text-content">{t(titleKey)}</h1>
        <p className="text-sm leading-relaxed text-content-secondary">{t(descriptionKey)}</p>
      </div>

      <span className="rounded-full border border-edge bg-elevated px-3 py-1 text-xs text-content-muted">
        {t('common.comingIn', { phase: t(`phases.${phaseKey}`) })}
      </span>
    </div>
  )
}
