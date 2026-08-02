import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck, XCircle } from 'lucide-react'
import type { ProviderSummary } from '@shared/ipc/contract'
import { CAPABILITIES_QUERY_KEY, useCapabilities } from '../../../hooks/use-capabilities'
import { ipc } from '../../../lib/ipc'
import { cn } from '../../../lib/cn'
import { Button, Field, Section, TextInput, Toggle } from '../ui'

const PROVIDERS_QUERY_KEY = ['providers'] as const

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestión de proveedores y claves de API
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lo más importante de esta pantalla es lo que **no** ocurre: la clave escrita
 * aquí viaja al proceso main, se cifra con el llavero del sistema y no vuelve.
 * Lo que se muestra después son puntos y los cuatro últimos caracteres,
 * calculados en el main. El renderer nunca tiene la clave.
 */
export function ApisSection(): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const capabilities = useCapabilities()

  const { data: providers = [] } = useQuery({
    queryKey: PROVIDERS_QUERY_KEY,
    queryFn: () => ipc.providers.list(),
  })

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY }),
    ])
  }

  const setCredential = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      ipc.providers.setCredential(provider, apiKey),
    onSuccess: refresh,
  })

  const removeCredential = useMutation({
    mutationFn: (provider: string) => ipc.providers.removeCredential(provider),
    onSuccess: refresh,
  })

  const setConfig = useMutation({
    mutationFn: (input: { provider: string; enabled?: boolean; priority?: number }) =>
      ipc.providers.setConfig(input),
    onSuccess: refresh,
  })

  const testCredential = useMutation({
    mutationFn: (provider: string) => ipc.providers.test(provider),
    onSuccess: refresh,
  })

  const available = capabilities.filter((c) => c.state === 'available')
  const degraded = capabilities.filter((c) => c.state === 'degraded')
  const unavailable = capabilities.filter((c) => c.state === 'unavailable')

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('settings.apis.title')} description={t('settings.apis.description')}>
        <div className="flex items-start gap-2 rounded-panel border border-edge bg-elevated p-3">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
          <p className="text-xs leading-relaxed text-content-muted">
            {t('settings.apis.securityNote')}
          </p>
        </div>

        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onSaveKey={(apiKey) => setCredential.mutate({ provider: provider.id, apiKey })}
            onRemoveKey={() => removeCredential.mutate(provider.id)}
            onToggle={(enabled) => setConfig.mutate({ provider: provider.id, enabled })}
            onPriority={(priority) => setConfig.mutate({ provider: provider.id, priority })}
            onTest={() => testCredential.mutate(provider.id)}
            testing={testCredential.isPending && testCredential.variables === provider.id}
            testResult={
              testCredential.data && testCredential.variables === provider.id
                ? testCredential.data
                : null
            }
          />
        ))}
      </Section>

      <Section
        title={t('settings.apis.capabilitiesTitle')}
        description={t('settings.apis.capabilitiesDescription')}
      >
        <CapabilityList
          title={t('settings.apis.available', { count: available.length })}
          tone="positive"
          items={available.map((c) => ({ key: c.capability, detail: c.provider ?? '' }))}
        />
        {degraded.length > 0 && (
          <CapabilityList
            title={t('settings.apis.degraded', { count: degraded.length })}
            tone="warning"
            items={degraded.map((c) => ({ key: c.capability, detail: c.reason ?? '' }))}
          />
        )}
        <CapabilityList
          title={t('settings.apis.unavailable', { count: unavailable.length })}
          tone="muted"
          items={unavailable.map((c) => ({ key: c.capability, detail: c.reason ?? '' }))}
        />
      </Section>
    </div>
  )
}

export function ProviderCard({
  provider,
  onSaveKey,
  onRemoveKey,
  onToggle,
  onPriority,
  onTest,
  testing,
  testResult,
}: {
  provider: ProviderSummary
  onSaveKey: (apiKey: string) => void
  onRemoveKey: () => void
  onToggle: (enabled: boolean) => void
  onPriority: (priority: number) => void
  onTest: () => void
  testing: boolean
  testResult: { ok: boolean; message: string } | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-edge bg-elevated p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm text-content">
            {provider.displayName}
            {provider.hasSecret ? (
              <CheckCircle2 className="size-3.5 text-positive" aria-hidden />
            ) : provider.requiresApiKey ? (
              <XCircle className="size-3.5 text-content-muted" aria-hidden />
            ) : null}
          </span>
          <span className="text-xs text-content-muted">
            {provider.requiresApiKey
              ? (provider.masked ?? t('settings.apis.noKey'))
              : t('settings.apis.noKeyNeeded')}
          </span>
        </div>

        <Toggle checked={provider.enabled} onChange={onToggle} label={t('settings.apis.enabled')} />
      </div>

      {provider.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {provider.capabilities.map((capability) => (
            <span
              key={capability}
              className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-content-muted"
            >
              {capability}
            </span>
          ))}
        </div>
      )}

      {provider.requiresApiKey && (
        <div className="flex items-end gap-2">
          <TextInput
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('settings.apis.keyPlaceholder')}
            className="flex-1"
            autoComplete="off"
          />
          <Button
            variant="primary"
            disabled={draft.trim().length === 0}
            onClick={() => {
              onSaveKey(draft.trim())
              // Se limpia en cuanto sale: no tiene por qué seguir en memoria del
              // renderer una vez entregada al main.
              setDraft('')
            }}
          >
            {t('common.save')}
          </Button>
          {provider.hasSecret && (
            <Button variant="danger" onClick={onRemoveKey}>
              {t('settings.apis.removeKey')}
            </Button>
          )}
        </div>
      )}

      {/* Comprobar hace una llamada real: es la diferencia entre «guardé una
          clave» y «la clave funciona». */}
      {(provider.hasSecret || !provider.requiresApiKey) && (
        <div className="flex items-center gap-3">
          <Button onClick={onTest} disabled={testing}>
            {testing ? t('common.loading') : t('settings.apis.test')}
          </Button>
          {testResult && (
            <span
              className={cn(
                'flex items-center gap-1.5 text-xs',
                testResult.ok ? 'text-positive' : 'text-negative',
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <XCircle className="size-3.5 shrink-0" aria-hidden />
              )}
              {testResult.message}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <Field label={t('settings.apis.priority')} hint={t('settings.apis.priorityHint')}>
          <TextInput
            type="number"
            min={0}
            max={1000}
            value={provider.priority}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) onPriority(parsed)
            }}
            className="w-20 text-right"
          />
        </Field>
      </div>

      {provider.docsUrl && (
        <button
          type="button"
          onClick={() => void ipc.app.openExternal(provider.docsUrl ?? '')}
          className="flex items-center gap-1.5 self-start text-xs text-accent hover:underline"
        >
          <KeyRound className="size-3" aria-hidden />
          {t('settings.apis.getKey')}
          <ExternalLink className="size-3" aria-hidden />
        </button>
      )}
    </div>
  )
}

function CapabilityList({
  title,
  tone,
  items,
}: {
  title: string
  tone: 'positive' | 'warning' | 'muted'
  items: readonly { key: string; detail: string }[]
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <h3
        className={cn(
          'text-[10px] tracking-wide uppercase',
          tone === 'positive' && 'text-positive',
          tone === 'warning' && 'text-warning',
          tone === 'muted' && 'text-content-muted',
        )}
      >
        {title}
      </h3>
      {items.map((item) => (
        <div key={item.key} className="flex items-baseline gap-3 text-xs">
          <span className="w-36 shrink-0 text-content-secondary">{item.key}</span>
          <span className="truncate text-content-muted">{item.detail}</span>
        </div>
      ))}
    </div>
  )
}
