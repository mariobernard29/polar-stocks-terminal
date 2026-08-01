import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DockviewReact,
  themeAbyss,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import { useTranslation } from 'react-i18next'
import { PANEL_REGISTRY, resolvePanelParams } from '../../panels/registry'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { useLayouts } from './use-layouts'
import 'dockview-react/dist/styles/dockview.css'
import './workspace.css'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Espacio de trabajo
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Paneles que se mueven, se redimensionan, se cierran, se duplican y se guardan.
 *
 * La serialización de dockview se trata como una caja negra: se guarda tal cual
 * y se le devuelve tal cual. Lo único que interpretamos son los parámetros de
 * cada panel, y solo para validarlos al restaurar — un layout guardado hace
 * meses puede contener parámetros de una versión anterior del panel.
 */
export function Workspace(): React.JSX.Element {
  const { t } = useTranslation()
  const apiRef = useRef<DockviewApi | null>(null)
  const [ready, setReady] = useState(false)

  const layouts = useLayouts()

  /**
   * Mapa de componentes para dockview.
   *
   * Se construye una sola vez: si la identidad de este objeto cambiara entre
   * renders, dockview volvería a montar todos los paneles y el usuario perdería
   * el scroll y el estado interno de cada uno.
   */
  const components = useMemo(() => {
    const entries = Object.values(PANEL_REGISTRY).map((definition) => {
      const Component = definition.component

      const Wrapped = (props: IDockviewPanelProps): React.JSX.Element => (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-content-muted">
              {t('common.loading')}
            </div>
          }
        >
          <Component {...props} />
        </Suspense>
      )
      Wrapped.displayName = `Panel(${definition.type})`

      return [definition.type, Wrapped] as const
    })

    return Object.fromEntries(entries)
    // `t` se omite a propósito: solo afecta al texto del fallback y recrear el
    // mapa remontaría todos los paneles al cambiar de idioma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addPanel = useCallback((type: string, params?: Record<string, unknown>): void => {
    const api = apiRef.current
    const definition = PANEL_REGISTRY[type]
    if (!api || !definition) return

    api.addPanel({
      // Identificador único: dockview rechaza dos paneles con el mismo id, y
      // duplicar un panel debe producir uno nuevo, no reutilizar el existente.
      id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
      component: type,
      title: buildTitle(type, params ?? definition.defaultParams),
      params: params ?? { ...definition.defaultParams },
    })
  }, [])

  /** Duplica el panel activo conservando sus parámetros actuales. */
  const duplicateActive = useCallback((): void => {
    const api = apiRef.current
    const active = api?.activePanel
    if (!active) return

    const type = active.view.contentComponent
    addPanel(type, { ...(active.params as Record<string, unknown>) })
  }, [addPanel])

  const closeActive = useCallback((): void => {
    apiRef.current?.activePanel?.api.close()
  }, [])

  const onReady = useCallback(
    (event: DockviewReadyEvent): void => {
      apiRef.current = event.api
      setReady(true)

      const saved = layouts.defaultLayout
      if (saved) {
        try {
          event.api.fromJSON(JSON.parse(saved.state) as never)
          return
        } catch {
          // Un layout corrupto no debe dejar la aplicación con un lienzo vacío
          // e inexplicable: se ignora y se cae a la disposición inicial.
          event.api.clear()
        }
      }
      seedDefaultLayout(event.api)
    },
    [layouts.defaultLayout],
  )

  const serialize = useCallback((): string | null => {
    const api = apiRef.current
    if (!api) return null
    return JSON.stringify(api.toJSON())
  }, [])

  const restore = useCallback((state: string): void => {
    const api = apiRef.current
    if (!api) return
    try {
      api.fromJSON(JSON.parse(state) as never)
    } catch {
      api.clear()
      seedDefaultLayout(api)
    }
  }, [])

  const resetLayout = useCallback((): void => {
    const api = apiRef.current
    if (!api) return
    api.clear()
    seedDefaultLayout(api)
  }, [])

  // Publica las acciones para los atajos globales y el buscador, que viven en el
  // shell y no pueden recibirlas por props. Se retiran al desmontar para que
  // "cerrar panel" no haga nada raro desde otra sección.
  const registerActions = useWorkspaceStore((state) => state.register)
  const unregisterActions = useWorkspaceStore((state) => state.unregister)

  useEffect(() => {
    registerActions({ addPanel, duplicateActive, closeActive, resetLayout })
    return unregisterActions
  }, [registerActions, unregisterActions, addPanel, duplicateActive, closeActive, resetLayout])

  return (
    <div className="flex h-full flex-col">
      <WorkspaceToolbar
        disabled={!ready}
        onAddPanel={addPanel}
        onDuplicate={duplicateActive}
        onClosePanel={closeActive}
        onReset={resetLayout}
        serialize={serialize}
        restore={restore}
        layouts={layouts}
      />
      <div className="min-h-0 flex-1">
        {/*
          No se monta dockview hasta saber si hay una disposición guardada.

          `onReady` se dispara una sola vez, al montar. Si dockview se montara
          antes de que resolviera la consulta, `defaultLayout` sería null en ese
          instante y el espacio de trabajo se sembraría con la disposición
          inicial — descartando en silencio lo que el usuario tenía guardado.
          Esperar unos milisegundos es preferible a perderle el trabajo.
        */}
        {layouts.isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-content-muted">
            {t('common.loading')}
          </div>
        ) : (
          <DockviewReact components={components} onReady={onReady} theme={themeAbyss} />
        )}
      </div>
    </div>
  )
}

/** Título legible del panel, con su símbolo cuando lo tiene. */
function buildTitle(type: string, params: Record<string, unknown>): string {
  const symbol = typeof params['symbol'] === 'string' ? params['symbol'] : null

  switch (type) {
    case 'chart':
      return symbol ? `Gráfico · ${symbol}` : 'Gráfico'
    case 'news':
      return symbol ? `Noticias · ${symbol}` : 'Noticias'
    case 'watchlist':
      return 'Lista'
    default:
      return type
  }
}

/**
 * Disposición inicial de un usuario nuevo.
 *
 * Se construye por código y no con un JSON grabado: un JSON de dockview atado a
 * una versión concreta de la librería envejece mal, mientras que esto sigue
 * funcionando mientras exista `addPanel`.
 */
function seedDefaultLayout(api: DockviewApi): void {
  const chart = api.addPanel({
    id: 'chart-inicial',
    component: 'chart',
    title: 'Gráfico · AAPL',
    params: { ...resolvePanelParams('chart', undefined) },
  })

  api.addPanel({
    id: 'watchlist-inicial',
    component: 'watchlist',
    title: 'Lista',
    params: { ...resolvePanelParams('watchlist', undefined) },
    position: { referencePanel: chart, direction: 'right' },
  })

  api.addPanel({
    id: 'news-inicial',
    component: 'news',
    title: 'Noticias',
    params: { ...resolvePanelParams('news', undefined) },
    position: { referencePanel: chart, direction: 'below' },
  })
}
