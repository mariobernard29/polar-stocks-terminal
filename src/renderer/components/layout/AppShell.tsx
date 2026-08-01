import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CommandPalette } from '../../features/command/CommandPalette'
import { useShortcuts } from '../../hooks/use-shortcuts'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/**
 * Estructura fija de la aplicación: barra superior, barra lateral y el área de
 * contenido que cambia con la ruta.
 *
 * El `Suspense` está aquí y no en cada página porque las rutas se cargan de
 * forma diferida: sin él, navegar a una sección todavía no descargada rompería
 * el árbol de React.
 */
export function AppShell(): React.JSX.Element {
  const { t } = useTranslation()

  // Los atajos se registran una sola vez, aquí: el shell está montado siempre,
  // así que funcionan en cualquier sección sin duplicar listeners.
  useShortcuts()

  return (
    <div className="flex h-full flex-col bg-base">
      <CommandPalette />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-content-muted">
                {t('common.loading')}
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
