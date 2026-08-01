import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSettings } from '../../../hooks/use-settings'
import { formatPrice, formatRelative } from '../../../lib/format'
import { Choice, Field, ReadOnlyRow, Section } from '../ui'

/**
 * Fechas fijas para la vista previa.
 *
 * Nada de `Date.now()` en el render: además de ser impuro, un ejemplo que
 * cambia cada segundo es peor como muestra — con una referencia fija, comparar
 * el formato entre idiomas es inmediato.
 */
const PREVIEW_NOW = new Date('2026-06-15T12:00:00Z')
const PREVIEW_THEN = new Date('2026-06-15T09:00:00Z')

export function LanguageSection(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const update = useUpdateSettings()
  const locale = i18n.language

  return (
    <Section title={t('settings.language.title')} description={t('settings.language.description')}>
      <Field label={t('settings.language.interface')}>
        <Choice
          options={[
            { value: 'es' as const, label: 'Español' },
            { value: 'en' as const, label: 'English' },
          ]}
          value={settings['general.language']}
          onSelect={(value) => void update({ 'general.language': value })}
        />
      </Field>

      {/*
        El idioma no cambia solo los textos: cambia cómo se escriben los números
        y las fechas. `1.234,56` y `1,234.56` son el mismo importe, y confundirlos
        en una herramienta financiera no es un detalle estético. Se muestra el
        efecto real para que quede claro qué se está eligiendo.
      */}
      <Field label={t('settings.language.formatPreview')} stacked>
        <div className="flex flex-col gap-2 rounded-panel border border-edge bg-elevated p-3">
          <ReadOnlyRow
            label={t('settings.language.exampleAmount')}
            value={formatPrice(1234567.891, 'USD', locale)}
          />
          <ReadOnlyRow
            label={t('settings.language.exampleSmall')}
            value={formatPrice(0.000021, 'USD', locale)}
          />
          <ReadOnlyRow
            label={t('settings.language.exampleDate')}
            value={formatRelative(PREVIEW_THEN, locale, PREVIEW_NOW)}
          />
        </div>
      </Field>
    </Section>
  )
}
