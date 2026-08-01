import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSettings } from '../../../hooks/use-settings'
import { Field, Section, TextInput, Toggle } from '../ui'

/** Zonas horarias frecuentes en mercados. La barra superior muestra la elegida. */
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Frankfurt',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Australia/Sydney',
] as const

export function GeneralSection(): React.JSX.Element {
  const { t } = useTranslation()
  const settings = useSettings()
  const update = useUpdateSettings()

  return (
    <Section title={t('settings.general.title')} description={t('settings.general.description')}>
      <Field
        label={t('settings.general.restoreLayout')}
        hint={t('settings.general.restoreLayoutHint')}
      >
        <Toggle
          checked={settings['general.restoreLastLayout']}
          onChange={(checked) => void update({ 'general.restoreLastLayout': checked })}
          label={t('settings.general.restoreLayout')}
        />
      </Field>

      <Field
        label={t('settings.general.launchOnStartup')}
        hint={t('settings.general.launchOnStartupHint')}
      >
        <Toggle
          checked={settings['general.launchOnStartup']}
          onChange={(checked) => void update({ 'general.launchOnStartup': checked })}
          label={t('settings.general.launchOnStartup')}
        />
      </Field>

      <Field
        label={t('settings.general.secondaryTimezone')}
        hint={t('settings.general.secondaryTimezoneHint')}
      >
        <select
          value={settings['general.secondaryTimezone']}
          onChange={(event) => void update({ 'general.secondaryTimezone': event.target.value })}
          className="h-8 rounded-panel border border-edge bg-elevated px-2 text-xs text-content outline-none focus:border-accent"
        >
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace('_', ' ')}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('settings.general.cacheTtl')} hint={t('settings.general.cacheTtlHint')}>
        <TextInput
          type="number"
          min={0}
          max={86400}
          value={settings['data.cacheTtlSeconds']}
          onChange={(event) => {
            const parsed = Number(event.target.value)
            if (Number.isFinite(parsed)) void update({ 'data.cacheTtlSeconds': parsed })
          }}
          className="w-24 text-right"
        />
      </Field>
    </Section>
  )
}
