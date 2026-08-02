import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Database, Send, Square } from 'lucide-react'
import { PolarError } from '@shared/ipc/error-codes'
import { ipc, on } from '../../lib/ipc'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Polar AI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El requisito es que no invente nada. Se sostiene sobre tres capas, y la que
 * de verdad protege al usuario es la que se ve aquí:
 *
 *   1. Los datos se recopilan **antes** de preguntar y se entregan cerrados.
 *   2. Las instrucciones prohíben salir de ese bloque.
 *   3. **Debajo de cada respuesta se enseña qué datos se usaron.**
 *
 * Las dos primeras reducen la probabilidad de una cifra falsa. La tercera la
 * hace detectable, y es la única que no depende de que el modelo obedezca.
 */

interface Turn {
  readonly role: 'user' | 'assistant'
  content: string
  sources?: readonly string[]
  failures?: readonly string[]
  meta?: string
}

export function AiPage(): React.JSX.Element {
  const { t } = useTranslation()

  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const providers = useQuery({ queryKey: ['ai', 'providers'], queryFn: () => ipc.ai.providers() })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => ipc.settings.getAll() })

  const active = providers.data?.find((provider) => provider.id === settings.data?.['ai.provider'])
  const configured = active?.hasKey ?? false

  const scroller = useRef<HTMLDivElement>(null)

  /**
   * Los trozos se acumulan en el último turno.
   *
   * Se escucha siempre, no solo mientras hay una petición viva: si el oyente se
   * montara al enviar, los primeros trozos podrían llegar antes de que React
   * hubiera aplicado el efecto y se perderían las primeras palabras.
   */
  useEffect(
    () =>
      on('ai:delta', ({ text }) => {
        setTurns((current) => {
          const last = current[current.length - 1]
          if (!last || last.role !== 'assistant') return current
          const next = [...current]
          next[next.length - 1] = { ...last, content: last.content + text }
          return next
        })
      }),
    [],
  )

  // Seguir el final mientras se escribe. Sin esto hay que arrastrar la barra a
  // mano durante toda la respuesta.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [turns])

  const send = async (): Promise<void> => {
    const question = draft.trim()
    if (question === '' || busy) return

    setDraft('')
    setError(null)
    setBusy(true)

    // El historial que viaja es el de **antes** de este turno, y solo los
    // mensajes ya completos.
    const history = turns.map((turn) => ({ role: turn.role, content: turn.content }))

    setTurns((current) => [
      ...current,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ])

    try {
      const result = await ipc.ai.ask({ question, history, focusSymbol: null })
      setTurns((current) => {
        const next = [...current]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            sources: result.sources,
            failures: result.failures,
            meta: `${result.provider} · ${result.model}`,
          }
        }
        return next
      })
    } catch (caught) {
      // Cancelar no es un fallo: el usuario lo ha pedido. Se conserva lo que ya
      // se había escrito en lugar de pintar un error rojo encima.
      if (caught instanceof PolarError && caught.code === 'CANCELLED') return

      setError(caught instanceof PolarError ? caught.message : t('ai.genericError'))

      // Se retira el turno del asistente si no llegó a escribir nada. Dejarlo
      // vacío pinta una burbuja en blanco junto al error, como si la respuesta
      // fuera «nada» en vez de no haberla habido.
      setTurns((current) => {
        const last = current[current.length - 1]
        if (last?.role === 'assistant' && last.content === '') return current.slice(0, -1)
        return current
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-content">{t('pages.ai.title')}</h1>
        <p className="text-sm text-content-secondary">{t('pages.ai.description')}</p>
      </header>

      {!configured && providers.isSuccess && settings.isSuccess && (
        <div className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-xs leading-relaxed text-content-secondary">
            {t('ai.notConfigured', { provider: active?.displayName ?? '—' })}
          </p>
        </div>
      )}

      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-panel border border-edge bg-surface p-4"
      >
        {turns.length === 0 && (
          <div className="m-auto flex max-w-md flex-col items-center gap-2 text-center">
            <p className="text-sm text-content-secondary">{t('ai.emptyTitle')}</p>
            <p className="text-xs leading-relaxed text-content-muted">{t('ai.emptyHint')}</p>
          </div>
        )}

        {turns.map((turn, index) => (
          <TurnView
            key={index}
            turn={turn}
            isStreaming={busy && index === turns.length - 1 && turn.role === 'assistant'}
          />
        ))}

        {error !== null && <p className="text-xs text-negative">{error}</p>}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter envía, Mayús+Enter hace salto de línea. Es lo que la gente
            // espera de un chat, y lo contrario sorprende.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={t('ai.placeholder')}
          className="flex-1 resize-none rounded-panel border border-edge bg-base px-3 py-2 text-xs leading-relaxed text-content transition-colors duration-120 outline-none placeholder:text-content-muted focus:border-accent"
        />

        {busy ? (
          <button
            type="button"
            onClick={() => void ipc.ai.cancel()}
            className="flex items-center gap-1.5 rounded-panel border border-edge px-3 py-2 text-xs text-content-secondary transition-colors hover:border-edge-strong hover:text-content"
          >
            <Square className="size-3.5" aria-hidden />
            {t('ai.stop')}
          </button>
        ) : (
          <button
            type="submit"
            disabled={draft.trim() === ''}
            className="flex items-center gap-1.5 rounded-panel bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity duration-120 hover:opacity-90 disabled:opacity-40"
          >
            <Send className="size-3.5" aria-hidden />
            {t('ai.send')}
          </button>
        )}
      </form>

      <p className="text-[11px] leading-relaxed text-content-muted">{t('ai.disclaimer')}</p>
    </div>
  )
}

function TurnView({ turn, isStreaming }: { turn: Turn; isStreaming: boolean }): React.JSX.Element {
  const { t } = useTranslation()

  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-panel bg-accent-muted px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-content">
          {turn.content}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed whitespace-pre-wrap text-content">
        {turn.content}
        {isStreaming && <span className="ml-0.5 inline-block animate-pulse text-accent">▋</span>}
      </p>

      {/*
        Qué datos se usaron. Es la parte comprobable del «nunca inventar»: si la
        respuesta menciona un precio y aquí no aparece su cotización, algo va
        mal y se ve a simple vista.
      */}
      {turn.sources !== undefined && turn.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Database className="size-3 text-content-muted" aria-hidden />
          <span className="text-[10px] text-content-muted">{t('ai.sources')}</span>
          {turn.sources.map((source) => (
            <span
              key={source}
              className="rounded-panel border border-edge px-1.5 py-0.5 text-[10px] text-content-secondary"
            >
              {source}
            </span>
          ))}
        </div>
      )}

      {turn.sources !== undefined && turn.sources.length === 0 && (
        <span className="text-[10px] text-content-muted">{t('ai.noSources')}</span>
      )}

      {turn.failures !== undefined && turn.failures.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {turn.failures.map((failure) => (
            <span key={failure} className="text-[10px] text-warning">
              {failure}
            </span>
          ))}
        </div>
      )}

      {turn.meta !== undefined && (
        <span className="text-[10px] text-content-muted">{turn.meta}</span>
      )}
    </div>
  )
}
