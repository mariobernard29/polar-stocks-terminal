import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react'
import type { NewsCategory, NewsItem } from '@shared/domain'
import { ipc } from '../../lib/ipc'
import { formatRelative } from '../../lib/format'
import { cn } from '../../lib/cn'

const BOOKMARK_IDS_KEY = ['news', 'bookmarkedIds'] as const
const BOOKMARKS_KEY = ['news', 'bookmarks'] as const

/**
 * Categorías ofrecidas.
 *
 * `null` significa titulares generales de mercado. Se listan explícitamente en
 * vez de derivarlas del dominio porque no todas las categorías del dominio
 * tienen un proveedor detrás — ofrecer un filtro que no filtra sería peor que
 * no ofrecerlo.
 */
const CATEGORIES: readonly (NewsCategory | null)[] = [
  null,
  'economy',
  'technology',
  'ai',
  'crypto',
]

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Noticias
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Titulares filtrables por tema, con la posibilidad de guardarlos.
 *
 * Los enlaces se abren en el navegador del sistema por IPC, nunca con un `<a>`:
 * dentro de Electron eso navegaría la propia ventana fuera de la aplicación. El
 * canal además solo admite `https`.
 */
export function NewsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const [category, setCategory] = useState<NewsCategory | null>(null)
  const [showSaved, setShowSaved] = useState(false)

  const feed = useQuery({
    queryKey: ['news', 'feed', category],
    queryFn: () => ipc.market.news({ symbol: null, category, limit: 40 }),
    enabled: !showSaved,
    retry: false,
  })

  const saved = useQuery({
    queryKey: BOOKMARKS_KEY,
    queryFn: () => ipc.newsBookmarks.list(),
    enabled: showSaved,
  })

  const savedIds = useQuery({
    queryKey: BOOKMARK_IDS_KEY,
    queryFn: () => ipc.newsBookmarks.ids(),
  })

  const toggle = useMutation({
    mutationFn: (item: NewsItem) => ipc.newsBookmarks.toggle(item),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOOKMARK_IDS_KEY })
      void queryClient.invalidateQueries({ queryKey: BOOKMARKS_KEY })
    },
  })

  const savedSet = new Set(savedIds.data ?? [])

  /**
   * Las guardadas se muestran con la misma forma que las del canal en vivo.
   * Un favorito guardado hace meses puede haber desaparecido de la API del
   * proveedor, por eso se conserva copia local del titular y el enlace.
   */
  const items: NewsItem[] = showSaved
    ? (saved.data ?? []).map((bookmark) => ({
        id: bookmark.newsId,
        headline: bookmark.headline,
        summary: null,
        url: bookmark.url,
        source: bookmark.source,
        publishedAt: bookmark.publishedAt,
        symbols: bookmark.symbols,
        category: 'general' as const,
        imageUrl: null,
        provider: 'guardado',
      }))
    : (feed.data ?? [])

  const isLoading = showSaved ? saved.isLoading : feed.isLoading

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-content">{t('pages.news.title')}</h1>
          <p className="text-sm text-content-secondary">{t('pages.news.description')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((value) => (
            <button
              key={value ?? 'market'}
              type="button"
              onClick={() => {
                setCategory(value)
                setShowSaved(false)
              }}
              className={cn(
                'rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
                !showSaved && category === value
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-edge text-content-secondary hover:border-edge-strong hover:text-content',
              )}
            >
              {t(`newsCategory.${value ?? 'market'}`)}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-edge" />

          <button
            type="button"
            onClick={() => setShowSaved(true)}
            className={cn(
              'flex items-center gap-1.5 rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
              showSaved
                ? 'border-accent bg-accent-muted text-accent'
                : 'border-edge text-content-secondary hover:border-edge-strong hover:text-content',
            )}
          >
            <Bookmark className="size-3" aria-hidden />
            {t('news.saved')}
            {savedSet.size > 0 && <span className="tabular opacity-70">{savedSet.size}</span>}
          </button>
        </div>
      </header>

      {isLoading && <p className="py-10 text-center text-sm text-content-muted">{t('common.loading')}</p>}

      {!isLoading && items.length === 0 && (
        <p className="rounded-panel border border-edge bg-surface p-10 text-center text-sm text-content-muted">
          {showSaved ? t('news.noneSaved') : t('common.noData')}
        </p>
      )}

      <ul className="divide-y divide-edge rounded-panel border border-edge bg-surface">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => void ipc.app.openExternal(item.url)}
              className="flex flex-1 flex-col gap-1 text-left"
            >
              <span className="flex items-start gap-2">
                <span className="flex-1 text-sm leading-snug text-content">{item.headline}</span>
                <ExternalLink
                  className="mt-0.5 size-3 shrink-0 text-content-muted opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </span>

              {item.summary && (
                <span className="line-clamp-2 text-xs leading-relaxed text-content-muted">
                  {item.summary}
                </span>
              )}

              <span className="flex flex-wrap items-center gap-2 text-[10px] text-content-muted">
                <span>{item.source}</span>
                <span>·</span>
                <span>{formatRelative(new Date(item.publishedAt), i18n.language)}</span>
                {item.symbols.slice(0, 4).map((symbol) => (
                  <span key={symbol} className="text-accent">
                    {symbol}
                  </span>
                ))}
              </span>
            </button>

            <button
              type="button"
              onClick={() => toggle.mutate(item)}
              title={savedSet.has(item.id) ? t('news.unsave') : t('news.save')}
              className={cn(
                'mt-0.5 shrink-0 transition-colors',
                savedSet.has(item.id)
                  ? 'text-accent'
                  : 'text-content-muted opacity-0 hover:text-content group-hover:opacity-100',
              )}
            >
              {savedSet.has(item.id) ? (
                <BookmarkCheck className="size-4" aria-hidden />
              ) : (
                <Bookmark className="size-4" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
