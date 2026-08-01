import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import type { IDockviewPanelProps } from 'dockview-react'
import { ipc } from '../lib/ipc'
import { formatRelative } from '../lib/format'
import { PanelState } from './PanelState'

/**
 * Panel de noticias.
 *
 * Los enlaces salen al navegador del sistema por IPC, nunca con un `<a href>`
 * normal: dentro de Electron eso navegaría la propia ventana de la aplicación
 * fuera de la app. El canal `app:openExternal` además solo admite https.
 */
export function NewsPanel(props: IDockviewPanelProps): React.JSX.Element {
  const { i18n } = useTranslation()
  const params = props.params as { symbol?: string | null }
  const symbol = params.symbol ?? null

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['news', symbol],
    queryFn: () => ipc.market.news({ symbol, category: null, limit: 30 }),
    refetchInterval: 120_000,
  })

  return (
    <div className="h-full overflow-auto bg-base">
      <PanelState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        <ul className="divide-y divide-edge">
          {data?.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void ipc.app.openExternal(item.url)}
                className="group flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors duration-120 hover:bg-elevated"
              >
                <span className="flex items-start gap-2">
                  <span className="flex-1 text-xs leading-snug text-content">{item.headline}</span>
                  <ExternalLink
                    className="mt-0.5 size-3 shrink-0 text-content-muted opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </span>
                <span className="flex items-center gap-2 text-[10px] text-content-muted">
                  <span>{item.source}</span>
                  <span>·</span>
                  <time dateTime={new Date(item.publishedAt).toISOString()}>
                    {formatRelative(new Date(item.publishedAt), i18n.language)}
                  </time>
                  {item.symbols.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-accent">{item.symbols.join(', ')}</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PanelState>
    </div>
  )
}
