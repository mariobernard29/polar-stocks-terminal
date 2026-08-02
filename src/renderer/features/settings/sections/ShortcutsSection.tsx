import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { findShortcutConflicts, normalizeShortcut } from '@shared/shortcuts/keys'
import { COMMANDS } from '../../../app/commands'
import { Section } from '../ui'

/**
 * Listado de atajos con detección de conflictos.
 *
 * Los conflictos se calculan en vivo, no se dan por buenos: cuando la
 * personalización llegue en una fase posterior, el aviso ya estará aquí y
 * funcionando desde el primer atajo que alguien reasigne.
 */
export function ShortcutsSection(): React.JSX.Element {
  const { t } = useTranslation()

  const bound = useMemo(() => COMMANDS.filter((command) => command.shortcut !== null), [])

  const conflicts = useMemo(
    () =>
      findShortcutConflicts(
        bound.map((command) => ({
          id: command.id,
          shortcut: command.shortcut ?? '',
          scope: command.scope,
        })),
      ),
    [bound],
  )

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof bound>()
    for (const command of bound) {
      const list = groups.get(command.group) ?? []
      list.push(command)
      groups.set(command.group, list)
    }
    return [...groups.entries()]
  }, [bound])

  return (
    <Section
      title={t('settings.shortcuts.title')}
      description={t('settings.shortcuts.description')}
    >
      {conflicts.length > 0 ? (
        <div className="flex items-start gap-2 rounded-panel border border-warning bg-elevated p-3">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-warning">{t('settings.shortcuts.conflictsFound')}</span>
            {conflicts.map((conflict) => (
              <span key={conflict.shortcut} className="text-content-muted">
                <span className="tabular">{conflict.shortcut}</span> —{' '}
                {conflict.commandIds.join(', ')}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-positive">{t('settings.shortcuts.noConflicts')}</p>
      )}

      {grouped.map(([group, commands]) => (
        <div key={group} className="flex flex-col gap-1.5">
          <h3 className="text-[10px] tracking-wide text-content-muted uppercase">
            {t(`palette.groups.${group}`)}
          </h3>
          {commands.map((command) => (
            <div
              key={command.id}
              className="flex items-center justify-between gap-4 border-b border-edge py-1.5 last:border-0"
            >
              <span className="flex items-center gap-2.5 text-xs text-content-secondary">
                <command.icon className="size-3.5 shrink-0 text-content-muted" aria-hidden />
                {t(`commands.${command.labelKey}`)}
              </span>
              <kbd className="tabular shrink-0 rounded border border-edge bg-elevated px-1.5 py-0.5 text-[10px] text-content-secondary">
                {normalizeShortcut(command.shortcut ?? '')}
              </kbd>
            </div>
          ))}
        </div>
      ))}

      <p className="text-xs text-content-muted">{t('settings.shortcuts.customizeLater')}</p>
    </Section>
  )
}
