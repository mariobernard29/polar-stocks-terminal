import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { useApplySettings, useSettings } from './hooks/use-settings'

/**
 * Raíz de la aplicación.
 *
 * Los ajustes se aplican en un componente interno, dentro del
 * `QueryClientProvider`: `useSettings` los lee de TanStack Query, así que no
 * puede vivir por encima del proveedor.
 */
export function App({ queryClient }: { queryClient: QueryClient }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsBridge />
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

/**
 * Traduce los ajustes guardados en atributos de `<html>`.
 *
 * No renderiza nada: existe solo por su efecto. Densidad, colores de mercado y
 * movimiento reducido se resuelven en CSS a partir de esos atributos, de modo
 * que cambiarlos no vuelve a renderizar el árbol.
 */
function SettingsBridge(): null {
  useApplySettings(useSettings())
  return null
}
