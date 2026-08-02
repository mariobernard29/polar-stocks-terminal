import { useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Plus, Star, Trash2, X } from 'lucide-react'
import type { Quote } from '@shared/domain'
import { inferAssetClass } from '@shared/market/symbols'
import type { Watchlist } from '@shared/ipc/contract'
import { useRealtimeQuotes } from '../../hooks/use-realtime'
import { ipc } from '../../lib/ipc'
import { formatPercent, formatPrice } from '../../lib/format'
import { cn } from '../../lib/cn'

const WATCHLISTS_KEY = ['watchlists'] as const
const FAVORITES_KEY = ['favorites'] as const

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Listas de seguimiento
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Varias listas con color y notas, más los favoritos.
 *
 * Favoritos y watchlists son conceptos distintos a propósito: una watchlist es
 * una agrupación con intención («Tecnología», «Vigilar resultados»); un favorito
 * es simplemente algo que se consulta a diario. Fundirlos obligaría a tratar una
 * lista llamada «Favoritos» de forma especial.
 */
export function WatchlistsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [newListName, setNewListName] = useState('')

  const lists = useQuery({ queryKey: WATCHLISTS_KEY, queryFn: () => ipc.watchlists.list() })
  const favorites = useQuery({ queryKey: FAVORITES_KEY, queryFn: () => ipc.favorites.list() })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: WATCHLISTS_KEY })
  }

  const createList = useMutation({
    mutationFn: (name: string) => ipc.watchlists.create(name),
    onSuccess: () => {
      setNewListName('')
      invalidate()
    },
  })

  const deleteList = useMutation({
    mutationFn: (id: string) => ipc.watchlists.remove(id),
    onSuccess: invalidate,
  })

  const addItem = useMutation({
    mutationFn: ({ watchlistId, symbol }: { watchlistId: string; symbol: string }) =>
      ipc.watchlists.addItem({
        watchlistId,
        symbol: symbol.toUpperCase(),
        // La clase se deduce del símbolo: es lo que decide qué proveedor lo
        // sirve y evita pedir Bitcoin a un proveedor de renta variable.
        assetClass: inferAssetClass(symbol),
      }),
    onSuccess: invalidate,
  })

  const removeItem = useMutation({
    mutationFn: (itemId: string) => ipc.watchlists.removeItem(itemId),
    onSuccess: invalidate,
  })

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-content">{t('pages.watchlists.title')}</h1>
          <p className="text-sm text-content-secondary">{t('pages.watchlists.description')}</p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (newListName.trim()) createList.mutate(newListName.trim())
          }}
          className="flex gap-2"
        >
          <input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            placeholder={t('watchlists.newListName')}
            maxLength={64}
            className="h-8 w-48 rounded-panel border border-edge bg-elevated px-2.5 text-xs text-content outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={newListName.trim().length === 0}
            className="flex h-8 items-center gap-1.5 rounded-panel bg-accent px-3 text-xs text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="size-3.5" aria-hidden />
            {t('watchlists.newList')}
          </button>
        </form>
      </header>

      {favorites.data && favorites.data.length > 0 && (
        <QuoteTable
          title={t('nav.favorites')}
          icon={Star}
          symbols={favorites.data.map((favorite) => favorite.symbol)}
        />
      )}

      {lists.data?.length === 0 && (
        <p className="rounded-panel border border-edge bg-surface p-8 text-center text-sm text-content-muted">
          {t('watchlists.empty')}
        </p>
      )}

      {lists.data?.map((list) => (
        <WatchlistCard
          key={list.id}
          list={list}
          onDelete={() => deleteList.mutate(list.id)}
          onAdd={(symbol) => addItem.mutate({ watchlistId: list.id, symbol })}
          onRemoveItem={(itemId) => removeItem.mutate(itemId)}
        />
      ))}
    </div>
  )
}

function WatchlistCard({
  list,
  onDelete,
  onAdd,
  onRemoveItem,
}: {
  list: Watchlist
  onDelete: () => void
  onAdd: (symbol: string) => void
  onRemoveItem: (itemId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')

  const symbols = list.items.map((item) => item.symbol)

  return (
    <section className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-5">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium text-content">{list.name}</h2>
        <span className="text-xs text-content-muted">
          {t('watchlists.count', { count: list.items.length })}
        </span>

        <div className="flex-1" />

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.trim()) {
              onAdd(draft.trim())
              setDraft('')
            }
          }}
          className="flex gap-1.5"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value.toUpperCase())}
            placeholder={t('watchlists.addSymbol')}
            maxLength={16}
            className="h-7 w-32 rounded border border-edge bg-elevated px-2 text-[11px] text-content outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded border border-edge px-2 text-[11px] text-content-secondary transition-colors hover:border-edge-strong hover:text-content"
          >
            <Plus className="size-3" aria-hidden />
          </button>
        </form>

        <button
          type="button"
          onClick={onDelete}
          title={t('watchlists.deleteList')}
          className="text-content-muted transition-colors hover:text-negative"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      {symbols.length === 0 ? (
        <p className="py-4 text-center text-xs text-content-muted">{t('watchlists.noSymbols')}</p>
      ) : (
        <QuoteTable
          symbols={symbols}
          removable={list.items.map((item) => ({ symbol: item.symbol, itemId: item.id }))}
          onRemove={onRemoveItem}
        />
      )}
    </section>
  )
}

/**
 * Tabla de cotizaciones reutilizada por listas y favoritos.
 *
 * Se suscribe al tiempo real de sus propios símbolos. El conteo de referencias
 * del gestor hace que dos tablas con el mismo activo compartan una sola
 * suscripción.
 */
function QuoteTable({
  title,
  icon: Icon,
  symbols,
  removable,
  onRemove,
}: {
  title?: string
  icon?: React.ComponentType<{ className?: string }>
  symbols: readonly string[]
  removable?: readonly { symbol: string; itemId: string }[]
  onRemove?: (itemId: string) => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { liveSymbols } = useRealtimeQuotes(symbols)

  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['quote', symbol],
      queryFn: () => ipc.market.quote(symbol),
      refetchInterval: liveSymbols.has(symbol) ? false : 60_000,
      retry: false,
    })),
  })

  const body = (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-content-muted">
          <th className="pb-2 text-left font-normal">{t('panels.columns.symbol')}</th>
          <th className="pb-2 text-right font-normal">{t('panels.columns.price')}</th>
          <th className="pb-2 text-right font-normal">{t('panels.columns.changePct')}</th>
          {onRemove && <th className="w-8" />}
        </tr>
      </thead>
      <tbody>
        {symbols.map((symbol, index) => {
          const quote = results[index]?.data as Quote | undefined
          const itemId = removable?.find((item) => item.symbol === symbol)?.itemId

          return (
            <tr key={symbol} className="group border-t border-edge hover:bg-elevated">
              <td
                onClick={() => void navigate(`/activo/${encodeURIComponent(symbol)}`)}
                className="cursor-pointer py-1.5 text-content"
              >
                <span className="flex items-center gap-1.5">
                  {symbol}
                  {liveSymbols.has(symbol) && (
                    <span className="size-1 rounded-full bg-positive" title={t('panels.live')} />
                  )}
                </span>
              </td>
              <td className="tabular py-1.5 text-right text-content-secondary">
                {quote ? formatPrice(quote.price, quote.currency, i18n.language) : '·'}
              </td>
              <td
                className={cn(
                  'tabular py-1.5 text-right',
                  !quote
                    ? 'text-content-muted'
                    : quote.changePercent >= 0
                      ? 'text-positive'
                      : 'text-negative',
                )}
              >
                {quote ? formatPercent(quote.changePercent, i18n.language) : '·'}
              </td>
              {onRemove && (
                <td className="py-1.5 text-right">
                  {itemId && (
                    <button
                      type="button"
                      onClick={() => onRemove(itemId)}
                      className="text-content-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-negative"
                      title={t('watchlists.removeSymbol')}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  if (!title) return body

  return (
    <section className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-5">
      <h2 className="flex items-center gap-2 text-xs font-medium tracking-wide text-content-muted uppercase">
        {Icon && <Icon className="size-3.5 text-accent" />}
        {title}
      </h2>
      {body}
    </section>
  )
}
