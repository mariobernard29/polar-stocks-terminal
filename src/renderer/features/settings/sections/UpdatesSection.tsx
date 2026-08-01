import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { Section } from '../ui'

/**
 * Actualizaciones.
 *
 * El actualizador automático se implementa en la Fase 5, junto con el empaquetado
 * y la firma de los instaladores. Esta sección dice exactamente eso en vez de
 * mostrar un botón «Buscar actualizaciones» que no hace nada — un control que
 * miente es peor que un control ausente.
 */
export function UpdatesSection(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <Section title={t('settings.updates.title')} description={t('settings.updates.description')}>
      <div className="flex items-start gap-2 rounded-panel border border-edge bg-elevated p-3">
        <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
        <div className="flex flex-col gap-1 text-xs leading-relaxed">
          <span className="text-content-secondary">{t('settings.updates.notYet')}</span>
          <span className="text-content-muted">{t('settings.updates.plan')}</span>
        </div>
      </div>
    </Section>
  )
}
