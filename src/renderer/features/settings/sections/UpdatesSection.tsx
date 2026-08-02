import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Download, ExternalLink, RefreshCw } from 'lucide-react'
import type { UpdateState } from '@shared/updates'
import { ipc, on } from '../../../lib/ipc'
import { Button, Field, Section } from '../ui'

const UPDATE_KEY = ['updates'] as const

/**
 * Actualizaciones.
 *
 * Tres acciones separadas —comprobar, descargar, instalar— y ninguna automática.
 * Una aplicación que se reinicia sola mientras el usuario mira una posición
 * abierta no es aceptable en una herramienta financiera.
 *
 * En macOS la aplicación no puede actualizarse sola porque no está firmada, así
 * que ahí se ofrece la página de descargas en vez de un botón que fallaría al
 * terminar de descargar. Se dice, además de hacerlo.
 */
export function UpdatesSection(): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const state = useQuery({ queryKey: UPDATE_KEY, queryFn: () => ipc.updates.state() })

  // El progreso llega por push desde el proceso principal, que es quien
  // descarga. Sondearlo daría una barra a saltos.
  useEffect(
    () =>
      on('updates:state', (next) => {
        queryClient.setQueryData(UPDATE_KEY, next)
      }),
    [queryClient],
  )

  const current = state.data

  return (
    <Section title={t('settings.updates.title')} description={t('settings.updates.description')}>
      {current && (
        <Field label={t('settings.updates.status')} stacked>
          <div className="flex flex-col gap-3 rounded-panel border border-edge bg-elevated p-3">
            <StatusLine state={current} />
            <Actions state={current} />
          </div>
        </Field>
      )}

      {/*
        La ausencia de firma no es un detalle interno: cambia lo que el usuario
        va a ver al instalar. Vale más avisarlo aquí que dejar que lo descubra
        con una advertencia roja del sistema.
      */}
      <p className="rounded-panel border border-edge bg-surface p-3 text-xs leading-relaxed text-content-muted">
        {t('settings.updates.unsigned')}
      </p>
    </Section>
  )
}

function StatusLine({ state }: { state: UpdateState }): React.JSX.Element {
  const { t } = useTranslation()

  const icon = {
    idle: <RefreshCw className="size-3.5 text-content-muted" aria-hidden />,
    checking: <RefreshCw className="size-3.5 animate-spin text-content-muted" aria-hidden />,
    available: <Download className="size-3.5 text-accent" aria-hidden />,
    manual: <Download className="size-3.5 text-accent" aria-hidden />,
    downloading: <Download className="size-3.5 text-accent" aria-hidden />,
    ready: <CheckCircle2 className="size-3.5 text-positive" aria-hidden />,
    current: <CheckCircle2 className="size-3.5 text-positive" aria-hidden />,
    error: <AlertTriangle className="size-3.5 text-negative" aria-hidden />,
    unsupported: <AlertTriangle className="size-3.5 text-content-muted" aria-hidden />,
  }[state.status]

  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5 text-xs leading-relaxed">
        <span className="text-content-secondary">
          {t(`settings.updates.state.${state.status}`, { version: state.version ?? '—' })}
        </span>

        {state.status === 'downloading' && state.percent !== null && (
          <span className="tabular text-content-muted">{state.percent} %</span>
        )}

        {/* El detalle del fallo, tal cual. Un «algo salió mal» genérico no deja
            al usuario ninguna vía para entender qué pasó. */}
        {state.message !== null && <span className="text-content-muted">{state.message}</span>}
      </div>
    </div>
  )
}

function Actions({ state }: { state: UpdateState }): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state.status !== 'unsupported' && (
        <Button
          onClick={() => void ipc.updates.check()}
          disabled={state.status === 'checking' || state.status === 'downloading'}
        >
          {t('settings.updates.check')}
        </Button>
      )}

      {state.status === 'available' && (
        <Button onClick={() => void ipc.updates.download()}>
          {t('settings.updates.download')}
        </Button>
      )}

      {state.status === 'ready' && (
        <Button onClick={() => void ipc.updates.install()}>
          {t('settings.updates.installRestart')}
        </Button>
      )}

      <button
        type="button"
        onClick={() => void ipc.updates.openReleases()}
        className="flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-accent"
      >
        <ExternalLink className="size-3" aria-hidden />
        {t('settings.updates.openReleases')}
      </button>
    </div>
  )
}
