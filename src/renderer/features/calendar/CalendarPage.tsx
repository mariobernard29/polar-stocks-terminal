import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Coins, Rocket } from 'lucide-react'
import type { CalendarEvent, CalendarEventKind } from '@shared/domain'
import { useCapability } from '../../hooks/use-capabilities'
import { ipc } from '../../lib/ipc'
import { formatCompact } from '../../lib/format'
import { cn } from '../../lib/cn'

const DAY_MS = 86_400_000

/** Ventanas ofrecidas, en días hacia delante. */
const RANGES = [7, 14, 30] as const

const KIND_ICON: Readonly<Record<CalendarEventKind, React.ComponentType<{ className?: string }>>> =
  {
    earnings: CalendarDays,
    dividend: Coins,
    ipo: Rocket,
  }

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Calendario
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Resultados, dividendos y salidas a bolsa, agrupados por día.
 *
 * El calendario **económico** (inflación, PIB, FOMC) no aparece porque ningún
 * proveedor configurado lo sirve en su plan gratuito: Finnhub responde 403 y FMP
 * 402 a esos endpoints. Se dice explícitamente en la propia pantalla en lugar de
 * mostrar una pestaña vacía o, peor, datos inventados.
 */
export function CalendarPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [days, setDays] = useState<number>(7)
  const [kinds, setKinds] = useState<CalendarEventKind[]>([])

  const economic = useCapability('economicCalendar')

  /**
   * Ancla del rango: hoy a medianoche, calculada una sola vez.
   *
   * No es solo para evitar una llamada impura durante el render. Con
   * `Date.now()` el rango se desplazaba unos milisegundos en cada repintado, lo
   * que cambiaba la clave de la consulta y volvía a pedir el calendario entero
   * sin motivo. Anclado a medianoche, «próximos 7 días» significa lo mismo toda
   * la sesión y la agrupación por día sale limpia.
   */
  const [anchor] = useState(() => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    return midnight.getTime()
  })

  const range = useMemo(() => ({ from: anchor, to: anchor + days * DAY_MS }), [anchor, days])

  const events = useQuery({
    queryKey: ['calendar', range.from, range.to, kinds.join(',')],
    queryFn: () => ipc.market.calendar({ from: range.from, to: range.to, kinds }),
    retry: false,
  })

  /** Agrupado por día natural, que es como se lee un calendario. */
  const byDay = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>()

    for (const event of [...(events.data ?? [])].sort((a, b) => a.date - b.date)) {
      const key = new Date(event.date).toISOString().slice(0, 10)
      const list = groups.get(key) ?? []
      list.push(event)
      groups.set(key, list)
    }
    return [...groups.entries()]
  }, [events.data])

  const toggleKind = (kind: CalendarEventKind): void => {
    setKinds((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-content">{t('pages.calendar.title')}</h1>
          <p className="text-sm text-content-secondary">{t('pages.calendar.description')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['earnings', 'dividend', 'ipo'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              className={cn(
                'rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
                kinds.length === 0 || kinds.includes(kind)
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-edge text-content-muted hover:text-content',
              )}
            >
              {t(`calendar.${kind}`)}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-edge" />

          {RANGES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={cn(
                'rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
                days === value
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-edge text-content-secondary hover:border-edge-strong hover:text-content',
              )}
            >
              {t('calendar.days', { count: value })}
            </button>
          ))}
        </div>
      </header>

      {/*
        Se dice por qué falta el calendario macro. La alternativa —omitirlo sin
        más— dejaría al usuario preguntándose si la función existe.
      */}
      {!economic.isAvailable && (
        <div className="flex items-start gap-2 rounded-panel border border-edge bg-elevated p-3">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-xs leading-relaxed text-content-muted">
            {t('calendar.noEconomic')}
          </p>
        </div>
      )}

      {events.isLoading && (
        <p className="py-10 text-center text-sm text-content-muted">{t('common.loading')}</p>
      )}

      {!events.isLoading && byDay.length === 0 && (
        <p className="rounded-panel border border-edge bg-surface p-10 text-center text-sm text-content-muted">
          {t('common.noData')}
        </p>
      )}

      {byDay.map(([day, dayEvents]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-content-muted">
            {new Intl.DateTimeFormat(i18n.language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date(`${day}T12:00:00Z`))}
          </h2>

          <ul className="divide-y divide-edge rounded-panel border border-edge bg-surface">
            {dayEvents.map((event) => {
              const Icon = KIND_ICON[event.kind]

              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => void navigate(`/activo/${encodeURIComponent(event.symbol)}`)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-elevated"
                  >
                    <Icon className="size-3.5 shrink-0 text-content-muted" aria-hidden />

                    <span className="w-20 shrink-0 text-xs text-content">{event.symbol}</span>

                    <span className="min-w-0 flex-1 truncate text-xs text-content-muted">
                      {event.name ?? t(`calendar.${event.kind}`)}
                    </span>

                    <EventDetail event={event} locale={i18n.language} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Detalle a la derecha, distinto según el tipo de evento. */
function EventDetail({
  event,
  locale,
}: {
  event: CalendarEvent
  locale: string
}): React.JSX.Element {
  const { t } = useTranslation()

  if (event.kind === 'earnings') {
    return (
      <span className="flex shrink-0 items-center gap-3 text-[11px] tabular">
        {event.timing && event.timing !== 'unknown' && (
          <span className="text-content-muted">{t(`calendar.timing.${event.timing}`)}</span>
        )}
        {event.epsEstimate !== null && (
          <span className="text-content-secondary">
            {t('calendar.epsEstimate')} {event.epsEstimate.toFixed(2).replace('.', ',')}
          </span>
        )}
      </span>
    )
  }

  if (event.kind === 'dividend') {
    return (
      <span className="shrink-0 text-[11px] tabular text-content-secondary">
        {event.amount !== null
          ? new Intl.NumberFormat(locale, {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2,
            }).format(event.amount)
          : '—'}
      </span>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-3 text-[11px] tabular text-content-secondary">
      {event.priceRange && <span>{event.priceRange}</span>}
      {event.shares !== null && <span>{formatCompact(event.shares, locale)}</span>}
    </span>
  )
}
