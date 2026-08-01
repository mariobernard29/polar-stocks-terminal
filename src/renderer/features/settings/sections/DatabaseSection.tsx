import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ipc } from '../../../lib/ipc'
import { ReadOnlyRow, Section } from '../ui'

export function DatabaseSection(): React.JSX.Element {
  const { t } = useTranslation()

  const { data: status } = useQuery({
    queryKey: ['db', 'status'],
    queryFn: () => ipc.db.status(),
  })

  return (
    <Section title={t('settings.database.title')} description={t('settings.database.description')}>
      <div className="flex flex-col gap-2">
        <ReadOnlyRow label={t('settings.database.path')} value={status?.path ?? '—'} />
        <ReadOnlyRow
          label={t('settings.database.size')}
          value={status ? `${(status.sizeBytes / 1024).toFixed(1)} KB` : '—'}
        />
        <ReadOnlyRow
          label={t('settings.database.migrations')}
          value={
            status
              ? status.appliedNow.length > 0
                ? t('settings.database.appliedNow', { count: status.appliedNow.length })
                : t('settings.database.upToDate', { count: status.alreadyApplied })
              : '—'
          }
        />
        <ReadOnlyRow label={t('settings.database.engine')} value="SQLite · libsql · Prisma 7" />
      </div>

      {/*
        La ruta se muestra completa y seleccionable a propósito: es lo primero
        que necesita alguien para hacer una copia de seguridad o abrir la base
        con un visor. Las instrucciones detalladas están en DATABASE_SETUP.md.
      */}
      <p className="text-xs leading-relaxed text-content-muted">
        {t('settings.database.backupNote')}
      </p>
    </Section>
  )
}
