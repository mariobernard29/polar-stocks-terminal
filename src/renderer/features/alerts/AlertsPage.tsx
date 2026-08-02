import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BellOff, Check, Info, Plus, Trash2 } from 'lucide-react'
import type { AlertCondition, AlertKind, AlertRecord } from '@shared/domain'
import { inferAssetClass, isCanonicalSymbol } from '@shared/market/symbols'
import { PolarError } from '@shared/ipc/error-codes'
import { ipc, on } from '../../lib/ipc'
import { formatDateTime, formatPercent, formatPrice } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Alertas
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Alertas de precio y de variación, más el centro de avisos disparados.
 *
 * La evaluación ocurre en el proceso principal, no aquí: una alerta que solo
 * funcionara con esta pantalla abierta no serviría de nada. Esta vista es la
 * ventana a un motor que corre por su cuenta, y por eso muestra explícitamente
 * qué está vigilando y con qué frecuencia.
 */

const ALERTS_KEY = ['alerts'] as const

type Tab = 'active' | 'history'

export function AlertsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('active')

  const alerts = useQuery({ queryKey: ALERTS_KEY, queryFn: () => ipc.alerts.list() })
  const triggers = useQuery({
    queryKey: ['alerts', 'triggers'],
    queryFn: () => ipc.alerts.triggers(50),
  })
  const capabilities = useQuery({
    queryKey: ['alerts', 'capabilities'],
    queryFn: () => ipc.alerts.capabilities(),
    // El estado del flujo en vivo cambia solo; sin refresco, la pantalla diría
    // «conectado» mucho después de haberse caído.
    refetchInterval: 15_000,
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
  }

  /**
   * Un disparo llega por push desde el motor. Se refresca la lista porque una
   * alerta de un solo uso acaba de desactivarse y el historial tiene una
   * entrada nueva: sin esto, la pantalla seguiría mostrándola como activa.
   */
  useEffect(
    () =>
      on('alerts:triggered', () => {
        void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
      }),
    [queryClient],
  )

  const create = useMutation({
    mutationFn: (input: Parameters<typeof ipc.alerts.create>[0]) => ipc.alerts.create(input),
    onSuccess: invalidate,
  })

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      ipc.alerts.setEnabled(id, enabled),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => ipc.alerts.remove(id),
    onSuccess: invalidate,
  })

  const acknowledgeAll = useMutation({
    mutationFn: () => ipc.alerts.acknowledgeAll(),
    onSuccess: invalidate,
  })

  const unacknowledged = (triggers.data ?? []).filter((trigger) => !trigger.acknowledged).length

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-content">{t('pages.alerts.title')}</h1>
        <p className="text-sm text-content-secondary">{t('pages.alerts.description')}</p>
      </header>

      <EngineStatus capabilities={capabilities.data} />

      <AlertForm
        onSubmit={(input) => create.mutate(input)}
        isPending={create.isPending}
        error={create.error instanceof PolarError ? create.error.message : null}
        /*
          El resultado entero, no sus campos sueltos. `alreadySatisfied` ya usa
          `null` para «no se pudo comprobar», así que desplegarlo aquí haría
          indistinguible ese caso de «todavía no se ha creado ninguna alerta», y
          el aviso saldría nada más abrir la pantalla.
        */
        result={create.data ?? null}
      />

      <div className="flex items-center gap-1.5">
        {(['active', 'history'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
              tab === value
                ? 'border-accent bg-accent-muted text-accent'
                : 'border-edge text-content-secondary hover:border-edge-strong hover:text-content',
            )}
          >
            {t(`alerts.tabs.${value}`)}
            {value === 'history' && unacknowledged > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] text-white">
                {unacknowledged}
              </span>
            )}
          </button>
        ))}

        {tab === 'history' && unacknowledged > 0 && (
          <button
            type="button"
            onClick={() => acknowledgeAll.mutate()}
            className="ml-auto flex items-center gap-1.5 text-xs text-content-muted transition-colors hover:text-content"
          >
            <Check className="size-3.5" aria-hidden />
            {t('alerts.markAllRead')}
          </button>
        )}
      </div>

      {tab === 'active' && (
        <AlertList
          alerts={alerts.data ?? []}
          isLoading={alerts.isLoading}
          onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
          onDelete={(id) => remove.mutate(id)}
        />
      )}

      {tab === 'history' && <TriggerList triggers={triggers.data ?? []} />}

      <p className="text-[11px] leading-relaxed text-content-muted">{t('alerts.limitations')}</p>
    </div>
  )
}

/**
 * Qué vigila el motor ahora mismo.
 *
 * Sin esto, una alerta guardada sin proveedor de cotizaciones configurado
 * parecería activa y no se evaluaría nunca. Es exactamente el tipo de silencio
 * que hace que alguien confíe en un aviso que no va a llegar.
 */
function EngineStatus({
  capabilities,
}: {
  capabilities:
    | { canEvaluate: boolean; canNotify: boolean; pollIntervalMs: number; streaming: boolean }
    | undefined
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!capabilities) return null

  const seconds = Math.round(capabilities.pollIntervalMs / 1000)

  if (!capabilities.canEvaluate) {
    return (
      <div className="flex items-start gap-2 rounded-panel border border-negative/40 bg-negative/10 p-3">
        <BellOff className="mt-0.5 size-3.5 shrink-0 text-negative" aria-hidden />
        <p className="text-xs leading-relaxed text-content-secondary">
          {t('alerts.cannotEvaluate')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-panel border border-edge bg-elevated p-3">
      <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
      <p className="text-xs leading-relaxed text-content-muted">
        {t('alerts.engineStatus', { seconds })}
        {capabilities.streaming && ` ${t('alerts.streamingOn')}`}
        {!capabilities.canNotify && ` ${t('alerts.noDesktopNotifications')}`}
      </p>
    </div>
  )
}

const inputClass =
  'w-full rounded-panel border border-edge bg-base px-2 py-1.5 text-xs text-content outline-none transition-colors duration-120 placeholder:text-content-muted focus:border-accent'

function AlertForm({
  onSubmit,
  isPending,
  error,
  result,
}: {
  onSubmit: (input: {
    symbol: string
    assetClass: ReturnType<typeof inferAssetClass>
    kind: AlertKind
    condition: AlertCondition
    threshold: number
    once: boolean
  }) => void
  isPending: boolean
  error: string | null
  /** Resultado de la última creación. `null` si aún no se ha creado ninguna. */
  result: { alreadySatisfied: boolean | null; currentValue: number | null } | null
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [symbol, setSymbol] = useState('')
  const [kind, setKind] = useState<AlertKind>('price')
  const [condition, setCondition] = useState<AlertCondition>('above')
  const [threshold, setThreshold] = useState('')
  const [once, setOnce] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()

    const clean = symbol.trim().toUpperCase()
    if (!isCanonicalSymbol(clean)) {
      setProblem(t('alerts.errors.symbol'))
      return
    }

    // Coma decimal: quien escribe «200,5» no está cometiendo un error.
    const value = Number(threshold.trim().replace(',', '.'))
    if (!Number.isFinite(value)) {
      setProblem(t('alerts.errors.threshold'))
      return
    }

    setProblem(null)
    onSubmit({
      symbol: clean,
      assetClass: inferAssetClass(clean),
      kind,
      condition,
      threshold: value,
      once,
    })
    setSymbol('')
    setThreshold('')
  }

  const message = problem ?? error

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4"
    >
      <h3 className="text-xs font-medium tracking-wide text-content-muted uppercase">
        {t('alerts.create')}
      </h3>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-28 flex-col gap-1">
          <span className="text-[10px] tracking-wide text-content-muted uppercase">
            {t('panels.columns.symbol')}
          </span>
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="AAPL"
            maxLength={32}
            className={inputClass}
          />
        </label>

        <label className="flex w-36 flex-col gap-1">
          <span className="text-[10px] tracking-wide text-content-muted uppercase">
            {t('alerts.kind')}
          </span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as AlertKind)}
            className={inputClass}
          >
            <option value="price">{t('alerts.kinds.price')}</option>
            <option value="changePercent">{t('alerts.kinds.changePercent')}</option>
          </select>
        </label>

        <label className="flex w-32 flex-col gap-1">
          <span className="text-[10px] tracking-wide text-content-muted uppercase">
            {t('alerts.condition')}
          </span>
          <select
            value={condition}
            onChange={(event) => setCondition(event.target.value as AlertCondition)}
            className={inputClass}
          >
            <option value="above">{t('alerts.conditions.above')}</option>
            <option value="below">{t('alerts.conditions.below')}</option>
          </select>
        </label>

        <label className="flex w-28 flex-col gap-1">
          <span className="text-[10px] tracking-wide text-content-muted uppercase">
            {t('alerts.threshold')}
          </span>
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="decimal"
            placeholder={kind === 'price' ? '200' : '5'}
            className={cn(inputClass, 'tabular')}
          />
        </label>

        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-content-secondary">
          <input
            type="checkbox"
            checked={once}
            onChange={(event) => setOnce(event.target.checked)}
            className="accent-accent"
          />
          {t('alerts.once')}
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-panel bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-120 hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden />
          {t('common.add')}
        </button>
      </div>

      {message !== null && <p className="text-xs text-negative">{message}</p>}

      {/*
        La alerta se ha guardado y está vigilando, pero no va a sonar todavía:
        su condición ya se cumplía al crearla. Decirlo aquí es la diferencia
        entre un comportamiento correcto y un comportamiento que parece roto.
      */}
      {message === null && result?.alreadySatisfied === true && result.currentValue !== null && (
        <p className="text-xs leading-relaxed text-warning">
          {t('alerts.alreadySatisfied', {
            value: result.currentValue.toLocaleString(i18n.language, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          })}
        </p>
      )}

      {message === null && result !== null && result.alreadySatisfied === null && (
        <p className="text-xs leading-relaxed text-content-muted">{t('alerts.couldNotCheck')}</p>
      )}
    </form>
  )
}

function AlertList({
  alerts,
  isLoading,
  onToggle,
  onDelete,
}: {
  alerts: readonly AlertRecord[]
  isLoading: boolean
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-content-muted">{t('common.loading')}</p>
  }

  if (alerts.length === 0) {
    return (
      <p className="rounded-panel border border-edge bg-surface p-10 text-center text-sm text-content-muted">
        {t('alerts.empty')}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-edge overflow-hidden rounded-panel border border-edge bg-surface">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex items-center gap-3 px-4 py-3">
          <input
            type="checkbox"
            checked={alert.enabled}
            onChange={(event) => onToggle(alert.id, event.target.checked)}
            aria-label={t('alerts.enabled')}
            className="accent-accent"
          />

          <button
            type="button"
            onClick={() => void navigate(`/activo/${encodeURIComponent(alert.symbol)}`)}
            className={cn(
              'flex flex-1 flex-col items-start gap-0.5 text-left',
              !alert.enabled && 'opacity-50',
            )}
          >
            <span className="text-xs text-content">
              {alert.symbol}{' '}
              <span className="text-content-muted">
                {t(`alerts.kinds.${alert.kind}`)} {t(`alerts.conditions.${alert.condition}`)}{' '}
                <span className="tabular text-content-secondary">
                  {alert.kind === 'price'
                    ? formatPrice(alert.threshold, 'USD', i18n.language, alert.assetClass)
                    : formatPercent(alert.threshold, i18n.language)}
                </span>
              </span>
            </span>
            <span className="text-[10px] text-content-muted">
              {alert.once ? t('alerts.once') : t('alerts.repeating')}
              {alert.lastTriggeredAt !== null &&
                ` · ${t('alerts.lastTriggered', {
                  at: formatDateTime(new Date(alert.lastTriggeredAt), i18n.language),
                })}`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(alert.id)}
            aria-label={t('common.delete')}
            className="text-content-muted transition-colors hover:text-negative"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function TriggerList({
  triggers,
}: {
  triggers: readonly {
    id: string
    message: string
    triggeredAt: number
    acknowledged: boolean
  }[]
}): React.JSX.Element {
  const { t, i18n } = useTranslation()

  if (triggers.length === 0) {
    return (
      <p className="rounded-panel border border-edge bg-surface p-10 text-center text-sm text-content-muted">
        {t('alerts.noTriggers')}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-edge overflow-hidden rounded-panel border border-edge bg-surface">
      {triggers.map((trigger) => (
        <li key={trigger.id} className="flex items-start gap-3 px-4 py-3">
          {/* Un punto marca lo no leído. Es menos intrusivo que un fondo de
              color y sigue siendo visible de un vistazo. */}
          <span
            className={cn(
              'mt-1.5 size-1.5 shrink-0 rounded-full',
              trigger.acknowledged ? 'bg-transparent' : 'bg-accent',
            )}
            aria-hidden
          />
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-xs leading-snug text-content">{trigger.message}</span>
            <span className="text-[10px] text-content-muted">
              {formatDateTime(new Date(trigger.triggeredAt), i18n.language)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
