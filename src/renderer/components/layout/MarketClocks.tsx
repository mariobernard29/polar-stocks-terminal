import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '@shared/market/session'
import { NY_TIMEZONE } from '@shared/market/session'
import { useMarketClock } from '../../hooks/use-market-clock'
import { formatTime } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * Hora local y hora de Nueva York con el estado real de la sesión.
 *
 * El estado no es decorativo: distingue pre-apertura de sesión regular y de
 * after-hours, y explica el motivo del cierre (fin de semana, festivo, fuera de
 * horario). Un precio significa cosas distintas según en qué sesión se haya
 * formado.
 */
export function MarketClocks(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { now, session } = useMarketClock()
  const locale = i18n.language

  return (
    <div className="flex items-center gap-6">
      <Clock label={t('session.local')} time={formatTime(now, locale)} />
      <Clock label={t('session.label')} time={formatTime(now, locale, NY_TIMEZONE)} />
      <SessionBadge session={session} />
    </div>
  )
}

function Clock({ label, time }: { label: string; time: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wide text-content-muted">{label}</span>
      <span className="tabular text-xs text-content-secondary">{time}</span>
    </div>
  )
}

function SessionBadge({ session }: { session: SessionInfo }): React.JSX.Element {
  const { t } = useTranslation()

  const tone = {
    open: 'text-positive bg-positive-muted',
    pre: 'text-warning bg-elevated',
    after: 'text-warning bg-elevated',
    closed: 'text-content-muted bg-elevated',
  }[session.state]

  const detail =
    session.state === 'closed' && session.reason
      ? t(`session.${session.reason}`)
      : session.earlyClose
        ? t('session.earlyClose')
        : null

  return (
    <div className={cn('flex items-center gap-2 rounded px-2 py-1', tone)}>
      <span
        className={cn(
          'size-1.5 rounded-full',
          session.state === 'open' ? 'bg-positive' : 'bg-current opacity-60',
        )}
        aria-hidden
      />
      <span className="text-xs font-medium">{t(`session.${session.state}`)}</span>
      {detail && <span className="text-[10px] opacity-70">· {detail}</span>}
    </div>
  )
}
