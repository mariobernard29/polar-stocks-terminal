/* eslint-disable react-refresh/only-export-components --
   Un archivo de rutas exporta la configuración del router, no componentes.
   Perder el fast refresh aquí es irrelevante: cambiar una ruta implica recargar
   la navegación de todas formas. */
import { lazy } from 'react'
import { createHashRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { PlaceholderPage } from '../components/PlaceholderPage'
import { NAVIGATION } from './navigation'

/**
 * Rutas de la aplicación.
 *
 * `createHashRouter`, no `createBrowserRouter`: en producción Electron sirve la
 * interfaz por `file://`, donde el enrutado por historial se rompe al recargar.
 *
 * Las secciones sin contenido propio todavía se generan a partir de la
 * definición de navegación, de modo que añadir una entrada al menú crea también
 * su ruta. No pueden discrepar.
 */

// Las secciones se cargan de forma diferida: un layout con paneles pesados no
// debe arrastrar su código al arranque.
const Workspace = lazy(() =>
  import('../features/workspace/Workspace').then((module) => ({ default: module.Workspace })),
)

const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

const WatchlistsPage = lazy(() =>
  import('../features/watchlists/WatchlistsPage').then((m) => ({ default: m.WatchlistsPage })),
)

const NewsPage = lazy(() =>
  import('../features/news/NewsPage').then((m) => ({ default: m.NewsPage })),
)

const CalendarPage = lazy(() =>
  import('../features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })),
)

const ScreenersPage = lazy(() =>
  import('../features/screeners/ScreenersPage').then((m) => ({ default: m.ScreenersPage })),
)

const PortfolioPage = lazy(() =>
  import('../features/portfolio/PortfolioPage').then((m) => ({ default: m.PortfolioPage })),
)

const AlertsPage = lazy(() =>
  import('../features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })),
)

const AssetPage = lazy(() =>
  import('../features/asset/AssetPage').then((module) => ({ default: module.AssetPage })),
)

const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

// El panel principal ya es el espacio de trabajo real; el resto de secciones
// siguen siendo marcadores hasta la fase que les corresponde.
const placeholderRoutes: RouteObject[] = NAVIGATION.filter(
  (item) => item.phase !== null && !['/', '/mercados', '/listas', '/noticias', '/calendario', '/screeners', '/portafolio', '/alertas'].includes(item.path),
).map((item) => ({
  path: item.path.slice(1),
  element: (
    <PlaceholderPage
      icon={item.icon}
      titleKey={`pages.${item.labelKey}.title`}
      descriptionKey={`pages.${item.labelKey}.description`}
      phaseKey={item.phase ?? 'phase2'}
    />
  ),
}))

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Workspace /> },
      ...placeholderRoutes,
      { path: 'mercados', element: <DashboardPage /> },
      { path: 'listas', element: <WatchlistsPage /> },
      { path: 'noticias', element: <NewsPage /> },
      { path: 'calendario', element: <CalendarPage /> },
      { path: 'screeners', element: <ScreenersPage /> },
      { path: 'portafolio', element: <PortfolioPage /> },
      { path: 'alertas', element: <AlertsPage /> },
      { path: 'activo/:symbol', element: <AssetPage /> },
      { path: 'configuracion', element: <SettingsPage /> },
      // Cualquier ruta desconocida vuelve al panel en lugar de dejar la ventana
      // en blanco, que en una app de escritorio parece un cuelgue.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
