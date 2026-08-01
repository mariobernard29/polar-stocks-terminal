import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ipc } from '../../../lib/ipc'
import { ReadOnlyRow, Section } from '../ui'

export function AboutSection(): React.JSX.Element {
  const { t } = useTranslation()

  const { data: info } = useQuery({
    queryKey: ['app', 'info'],
    queryFn: () => ipc.app.info(),
    staleTime: Infinity,
  })

  return (
    <Section title={t('settings.about.title')} description={t('settings.about.description')}>
      <div className="flex flex-col gap-2">
        <ReadOnlyRow label={t('settings.about.version')} value={info?.version ?? '—'} />
        <ReadOnlyRow
          label={t('settings.about.platform')}
          value={info ? `${info.platform} · ${info.arch}` : '—'}
        />
        <ReadOnlyRow label="Electron" value={info?.versions.electron ?? '—'} />
        <ReadOnlyRow label="Chromium" value={info?.versions.chrome ?? '—'} />
        <ReadOnlyRow label="Node.js" value={info?.versions.node ?? '—'} />
        <ReadOnlyRow
          label={t('settings.about.build')}
          value={info?.isPackaged === true ? t('settings.about.packaged') : t('settings.about.dev')}
        />
      </div>

      <p className="text-xs leading-relaxed text-content-muted">{t('settings.about.disclaimer')}</p>
    </Section>
  )
}
