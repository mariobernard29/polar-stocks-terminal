import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSettings } from '../../../hooks/use-settings'
import { Choice, Field, Section, Toggle } from '../ui'

export function AppearanceSection(): React.JSX.Element {
  const { t } = useTranslation()
  const settings = useSettings()
  const update = useUpdateSettings()

  return (
    <Section
      title={t('settings.appearance.title')}
      description={t('settings.appearance.description')}
    >
      <Field label={t('settings.appearance.density')} hint={t('settings.appearance.densityHint')}>
        <Choice
          options={[
            { value: 'comfortable' as const, label: t('settings.appearance.comfortable') },
            { value: 'compact' as const, label: t('settings.appearance.compact') },
          ]}
          value={settings['appearance.density']}
          onSelect={(value) => void update({ 'appearance.density': value })}
        />
      </Field>

      <Field label={t('settings.appearance.colors')} hint={t('settings.appearance.colorsHint')}>
        <Choice
          options={[
            { value: 'standard' as const, label: t('settings.appearance.standard') },
            { value: 'inverted' as const, label: t('settings.appearance.inverted') },
            { value: 'colorblind' as const, label: t('settings.appearance.colorblind') },
          ]}
          value={settings['appearance.marketColors']}
          onSelect={(value) => void update({ 'appearance.marketColors': value })}
        />
      </Field>

      {/* Muestra viva: el usuario ve el efecto sin salir de la pantalla. */}
      <Field label={t('settings.appearance.preview')}>
        <div className="tabular flex items-center gap-4 text-sm">
          <span className="text-positive">+2,41 %</span>
          <span className="text-negative">−1,08 %</span>
          <span className="text-accent">{t('settings.appearance.accent')}</span>
        </div>
      </Field>

      <Field
        label={t('settings.appearance.reduceMotion')}
        hint={t('settings.appearance.reduceMotionHint')}
      >
        <Toggle
          checked={settings['appearance.reduceMotion']}
          onChange={(checked) => void update({ 'appearance.reduceMotion': checked })}
          label={t('settings.appearance.reduceMotion')}
        />
      </Field>
    </Section>
  )
}
