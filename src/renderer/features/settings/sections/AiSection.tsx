import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, KeyRound } from 'lucide-react'
import { useSettings, useUpdateSettings } from '../../../hooks/use-settings'
import { ipc } from '../../../lib/ipc'
import { cn } from '../../../lib/cn'
import { Button, Choice, Field, Section, TextInput } from '../ui'

/**
 * Configuración de Polar AI.
 *
 * El proveedor es conmutable y ninguno está cableado, como se decidió en Fase 1.
 * La clave se guarda por el mismo camino que las de mercado —cifrada con
 * `safeStorage` y sin cruzar nunca el IPC de vuelta—, así que aquí solo se ve si
 * hay clave o no, jamás cuál.
 */
export function AiSection(): React.JSX.Element {
  const { t } = useTranslation()
  const settings = useSettings()
  const update = useUpdateSettings()
  const queryClient = useQueryClient()

  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  const providers = useQuery({ queryKey: ['ai', 'providers'], queryFn: () => ipc.ai.providers() })

  const activeId = settings['ai.provider']
  const active = providers.data?.find((provider) => provider.id === activeId)

  const saveKey = async (): Promise<void> => {
    const value = key.trim()
    if (value === '') return

    await ipc.providers.setCredential(activeId, value)
    setKey('')
    setSaved(true)
    await queryClient.invalidateQueries({ queryKey: ['ai', 'providers'] })
  }

  return (
    <Section title={t('settings.ai.title')} description={t('settings.ai.description')}>
      <Field label={t('ai.provider')}>
        <Choice
          options={(providers.data ?? []).map((provider) => ({
            value: provider.id,
            label: provider.displayName,
          }))}
          value={activeId}
          onSelect={(value) => {
            void update({ 'ai.provider': value })
            // El modelo se limpia al cambiar de proveedor: un `gpt-4.1`
            // heredado de OpenAI haría que Anthropic devolviera un 400 que el
            // usuario no sabría interpretar.
            void update({ 'ai.model': '' })
            setSaved(false)
          }}
        />
      </Field>

      {active && (
        <>
          <Field label={t('ai.model')} hint={t('ai.modelHint', { model: active.defaultModel })}>
            <div className="flex flex-col gap-2">
              <TextInput
                value={settings['ai.model']}
                onChange={(event) => void update({ 'ai.model': event.target.value })}
                placeholder={active.defaultModel}
              />
              <div className="flex flex-wrap gap-1.5">
                {active.knownModels.map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => void update({ 'ai.model': model })}
                    className={cn(
                      'rounded-panel border px-2 py-0.5 text-[10px] transition-colors duration-120',
                      settings['ai.model'] === model
                        ? 'border-accent bg-accent-muted text-accent'
                        : 'border-edge text-content-muted hover:border-edge-strong hover:text-content',
                    )}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          </Field>

          <Field label={t('settings.ai.apiKey')} stacked>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <TextInput
                  type="password"
                  value={key}
                  onChange={(event) => {
                    setKey(event.target.value)
                    setSaved(false)
                  }}
                  placeholder={active.hasKey ? '••••••••' : t('settings.ai.apiKeyPlaceholder')}
                  autoComplete="off"
                />
                <Button onClick={() => void saveKey()} disabled={key.trim() === ''}>
                  {t('common.save')}
                </Button>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <span
                  className={cn(
                    'flex items-center gap-1',
                    active.hasKey ? 'text-positive' : 'text-content-muted',
                  )}
                >
                  {active.hasKey ? (
                    <>
                      <Check className="size-3" aria-hidden />
                      {t('settings.ai.configured')}
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-3" aria-hidden />
                      {t('settings.ai.notConfigured')}
                    </>
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => void ipc.app.openExternal(active.docsUrl)}
                  className="flex items-center gap-1 text-content-muted transition-colors hover:text-accent"
                >
                  <ExternalLink className="size-3" aria-hidden />
                  {t('settings.ai.getKey')}
                </button>

                {saved && <span className="text-positive">{t('settings.ai.saved')}</span>}
              </div>
            </div>
          </Field>
        </>
      )}

      {/*
        La regla de anclaje no es un detalle de implementación: es lo que el
        usuario necesita saber para interpretar lo que lee en el panel.
      */}
      <p className="rounded-panel border border-edge bg-elevated p-3 text-xs leading-relaxed text-content-muted">
        {t('ai.disclaimer')}
      </p>
    </Section>
  )
}
