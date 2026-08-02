import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Search } from 'lucide-react'
import { isCanonicalSymbol } from '@shared/market/symbols'
import { useDebounced } from '../hooks/use-debounced'
import { ipc } from '../lib/ipc'
import { cn } from '../lib/cn'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Selector de activo de un panel
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cambia el activo **del panel que ya está abierto**, en el sitio donde el
 * usuario lo está mirando.
 *
 * Antes solo se podía elegir símbolo al crear el panel: el buscador universal
 * (Ctrl+K) abre uno *nuevo*, así que quien quería ver otro valor en su gráfico
 * acababa acumulando pestañas o sin saber cómo hacerlo. El nombre del activo
 * estaba escrito en la cabecera y no parecía pulsable, que es justo lo que hace
 * que una función exista y nadie la encuentre.
 */
export function SymbolPicker({
  symbol,
  onSelect,
}: {
  symbol: string
  onSelect: (symbol: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const debounced = useDebounced(query.trim(), 180)
  const container = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => ipc.market.search({ text: debounced, limit: 8 }),
    enabled: open && debounced.length >= 1,
    retry: false,
  })

  const items = results.data ?? []

  // El foco al abrir: si hay que pulsar otra vez para escribir, el selector
  // estorba más de lo que ayuda.
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Cerrar al pulsar fuera. Un desplegable que se queda abierto tapando el
  // gráfico es peor que no tenerlo.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const close = (): void => {
    setOpen(false)
    setQuery('')
    setHighlight(0)
  }

  const choose = (next: string): void => {
    onSelect(next.toUpperCase())
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) => Math.min(current + 1, Math.max(items.length - 1, 0)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const picked = items[highlight]
      if (picked) {
        choose(picked.symbol)
        return
      }
      // Sin resultados se acepta lo tecleado si tiene forma de símbolo. Los
      // índices (^GSPC) y algunos activos no aparecen en el buscador de todos
      // los proveedores, y bloquear la entrada manual dejaría fuera justo lo
      // que el usuario no puede encontrar de otro modo.
      const typed = query.trim().toUpperCase()
      if (isCanonicalSymbol(typed)) choose(typed)
    }
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title={t('panels.changeSymbol')}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-sm font-medium text-content transition-colors duration-120 hover:bg-elevated"
      >
        {symbol}
        <ChevronDown className="size-3 text-content-muted" aria-hidden />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-72 overflow-hidden rounded-panel border border-edge bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-edge px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-content-muted" aria-hidden />
            <input
              ref={input}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setHighlight(0)
              }}
              onKeyDown={onKeyDown}
              placeholder={t('panels.searchSymbol')}
              maxLength={32}
              className="w-full bg-transparent text-xs text-content outline-none placeholder:text-content-muted"
            />
          </div>

          <ul className="max-h-64 overflow-y-auto">
            {items.map((item, index) => (
              <li key={`${item.symbol}-${item.assetClass}`}>
                <button
                  type="button"
                  onClick={() => choose(item.symbol)}
                  onPointerEnter={() => setHighlight(index)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors',
                    index === highlight ? 'bg-elevated' : 'hover:bg-elevated',
                  )}
                >
                  <span className="w-16 shrink-0 truncate text-xs text-content">
                    {item.symbol}
                  </span>
                  <span className="flex-1 truncate text-[11px] text-content-muted">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-content-muted">
                    {t(`assetClass.${item.assetClass}`)}
                  </span>
                </button>
              </li>
            ))}

            {debounced.length >= 1 && !results.isFetching && items.length === 0 && (
              <li className="px-2.5 py-3 text-center text-[11px] text-content-muted">
                {isCanonicalSymbol(query.trim().toUpperCase())
                  ? t('panels.useTyped', { symbol: query.trim().toUpperCase() })
                  : t('common.noData')}
              </li>
            )}

            {debounced.length === 0 && (
              <li className="px-2.5 py-3 text-center text-[11px] text-content-muted">
                {t('panels.searchHint')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
