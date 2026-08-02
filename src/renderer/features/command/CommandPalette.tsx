import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Newspaper, Search, TrendingUp } from 'lucide-react'
import { parseCommand, type AssetAction } from '@shared/commands/parser'
import { COMMANDS } from '../../app/commands'
import { useCommandActions } from '../../hooks/use-command-actions'
import { useDebounced } from '../../hooks/use-debounced'
import { ipc } from '../../lib/ipc'
import { useUiStore } from '../../stores/ui-store'
import { getWorkspaceActions } from '../../stores/workspace-store'
import './palette.css'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Buscador universal (Ctrl+K)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Una sola caja para todo: abrir un activo, pedir su gráfico o sus noticias,
 * navegar o ejecutar un comando.
 *
 * Detalle de diseño importante: la acción sobre un símbolo solo se ofrece si el
 * buscador confirma que ese símbolo **existe**. El parser es permisivo a
 * propósito —`banco` tiene la misma forma que `AAPL`— y quien resuelve la
 * ambigüedad son los datos, no una heurística.
 */
export function CommandPalette(): React.JSX.Element {
  const { t } = useTranslation()
  const open = useUiStore((state) => state.commandPaletteOpen)
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen)
  const runCommand = useCommandActions()
  const navigate = useNavigate()

  // La consulta vive en el store: cerrar el buscador ya la limpia, sin efecto
  // que sincronice estado con estado.
  const input = useUiStore((state) => state.commandQuery)
  const setInput = useUiStore((state) => state.setCommandQuery)

  const debounced = useDebounced(input, 180)
  const parsed = useMemo(() => parseCommand(debounced), [debounced])

  /**
   * Qué se le pide al buscador.
   *
   * Con un comando completo («NVDA chart») hay que buscar **el símbolo**, no la
   * cadena entera: ningún activo se llama "NVDA CHART", así que buscar el texto
   * completo no devolvía nada, el símbolo no se confirmaba y la acción no
   * llegaba a ofrecerse — el comando parecía no existir.
   */
  const searchText = parsed.hasExplicitAction && parsed.symbol ? parsed.symbol : debounced

  const { data: results = [] } = useQuery({
    queryKey: ['search', searchText],
    queryFn: () => ipc.market.search({ text: searchText, limit: 8 }),
    enabled: open && searchText.trim().length > 0,
    staleTime: 300_000,
  })

  /** El símbolo del parser solo vale si aparece de verdad en el catálogo. */
  const confirmedSymbol = useMemo(() => {
    if (!parsed.symbol) return null
    return results.some((item) => item.symbol === parsed.symbol) ? parsed.symbol : null
  }, [parsed.symbol, results])

  const openAsset = (symbol: string, action: AssetAction): void => {
    // Sin verbo, el destino natural es la ficha completa del activo: es lo que
    // espera quien escribe solo «AAPL». Los verbos concretos abren su panel en
    // el espacio de trabajo, que es donde se comparan varios activos a la vez.
    if (action === 'overview' || action === 'financials' || action === 'metrics') {
      void navigate(`/activo/${encodeURIComponent(symbol)}`)
      setOpen(false)
      return
    }

    const workspace = getWorkspaceActions()
    if (!workspace) {
      // Los paneles solo existen dentro del espacio de trabajo. Fuera de él se
      // lleva a la ficha, que sí sabe mostrar lo mismo.
      void navigate(`/activo/${encodeURIComponent(symbol)}`)
      setOpen(false)
      return
    }

    if (action === 'news') {
      workspace.addPanel('news', { symbol })
    } else {
      workspace.addPanel('chart', { symbol, timeframe: '1D' })
    }
    setOpen(false)
  }

  /**
   * Selección del teclado.
   *
   * cmdk conserva la selección por valor, y los comandos de navegación están
   * siempre presentes (el filtrado lo hacemos nosotros). Resultado: al escribir,
   * la selección se quedaba clavada en «Ir al panel» mientras el resultado
   * relevante aparecía arriba sin seleccionar — pulsar Enter hacía algo que el
   * usuario no había pedido.
   *
   * Se controla el valor: la selección por defecto es siempre el primer
   * resultado, y las flechas la mueven a partir de ahí.
   */
  const topValue =
    confirmedSymbol && parsed.hasExplicitAction
      ? `action:${confirmedSymbol}:${parsed.action}`
      : results[0]
        ? `symbol:${results[0].symbol}`
        : undefined

  const [manualValue, setManualValue] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState(searchText)

  // Ajuste durante el render, no en un efecto: es el patrón que recomienda React
  // para reiniciar estado cuando cambia una entrada, y evita el repintado extra.
  if (lastQuery !== searchText) {
    setLastQuery(searchText)
    setManualValue(null)
  }

  const selectedValue = manualValue ?? topValue

  const commandGroups = useMemo(() => {
    const visible = COMMANDS.filter((command) => command.scope !== 'palette')
    return {
      navigation: visible.filter((command) => command.group === 'navigation'),
      workspace: visible.filter((command) => command.group === 'workspace'),
      app: visible.filter((command) => command.group === 'app' && command.id !== 'palette.open'),
    }
  }, [])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t('common.search')}
      // El filtrado lo hace el proveedor, no cmdk: sus resultados ya vienen
      // ordenados por relevancia y volver a filtrarlos los descartaría.
      shouldFilter={false}
      value={selectedValue}
      onValueChange={setManualValue}
      className="polar-palette"
    >
      <div className="flex items-center gap-2 border-b border-edge px-4">
        <Search className="size-4 shrink-0 text-content-muted" aria-hidden />
        <Command.Input
          value={input}
          onValueChange={setInput}
          placeholder={t('palette.placeholder')}
          className="h-12 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content-muted"
        />
      </div>

      <Command.List className="max-h-96 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-xs text-content-muted">
          {t('palette.noResults')}
        </Command.Empty>

        {/* Acción directa cuando el comando está completo y el símbolo existe. */}
        {confirmedSymbol && parsed.hasExplicitAction && (
          <Command.Group heading={t('palette.action')} className="polar-group">
            <PaletteItem
              value={`action:${confirmedSymbol}:${parsed.action}`}
              icon={parsed.action === 'news' ? Newspaper : BarChart3}
              label={t(`palette.actions.${parsed.action}`, { symbol: confirmedSymbol })}
              onSelect={() => openAsset(confirmedSymbol, parsed.action)}
            />
          </Command.Group>
        )}

        {results.length > 0 && (
          <Command.Group heading={t('palette.instruments')} className="polar-group">
            {results.map((instrument) => (
              <PaletteItem
                key={instrument.symbol}
                value={`symbol:${instrument.symbol}`}
                icon={TrendingUp}
                label={instrument.symbol}
                description={instrument.name}
                badge={instrument.assetClass}
                onSelect={() => openAsset(instrument.symbol, parsed.action)}
              />
            ))}
          </Command.Group>
        )}

        {Object.entries(commandGroups).map(([group, commands]) =>
          commands.length > 0 ? (
            <Command.Group
              key={group}
              heading={t(`palette.groups.${group}`)}
              className="polar-group"
            >
              {commands.map((command) => (
                <PaletteItem
                  key={command.id}
                  icon={command.icon}
                  label={t(`commands.${command.labelKey}`)}
                  shortcut={command.shortcut}
                  // cmdk necesita un valor buscable: sin el texto traducido,
                  // escribir "config" no encontraría "Ir a Configuración".
                  value={`cmd:${command.id} ${t(`commands.${command.labelKey}`)}`}
                  onSelect={() => {
                    runCommand(command.id)
                    setOpen(false)
                  }}
                />
              ))}
            </Command.Group>
          ) : null,
        )}
      </Command.List>
    </Command.Dialog>
  )
}

function PaletteItem({
  icon: Icon,
  label,
  description,
  badge,
  shortcut,
  value,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description?: string
  badge?: string
  shortcut?: string | null
  value?: string
  onSelect: () => void
}): React.JSX.Element {
  return (
    <Command.Item value={value ?? label} onSelect={onSelect} className="polar-item">
      <Icon className="size-3.5 shrink-0 text-content-muted" aria-hidden />
      <span className="shrink-0 text-content">{label}</span>
      {description && <span className="truncate text-content-muted">{description}</span>}
      <span className="flex-1" />
      {badge && (
        <span className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-content-muted">
          {badge}
        </span>
      )}
      {shortcut && (
        <kbd className="tabular shrink-0 text-[10px] text-content-muted">{shortcut}</kbd>
      )}
    </Command.Item>
  )
}
