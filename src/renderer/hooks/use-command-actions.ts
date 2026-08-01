import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { NAVIGATION_TARGETS } from '../app/commands'
import { ipc } from '../lib/ipc'
import { useUiStore } from '../stores/ui-store'
import { getWorkspaceActions } from '../stores/workspace-store'

/**
 * Ejecuta un comando por su identificador.
 *
 * Un único punto de despacho para el buscador y para los atajos: así una acción
 * se comporta igual se invoque como se invoque, y añadir un comando no obliga a
 * tocar dos sitios.
 */
export function useCommandActions(): (commandId: string) => void {
  const navigate = useNavigate()
  const setPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen)

  return useCallback(
    (commandId: string): void => {
      // Navegación: los destinos salen del catálogo, no de un `switch` paralelo
      // que habría que mantener sincronizado.
      const target = NAVIGATION_TARGETS[commandId]
      if (target) {
        void navigate(target)
        return
      }

      // Las acciones del espacio de trabajo solo existen cuando está montado.
      // Si el usuario está en Configuración, `workspace` es null y no pasa nada,
      // que es el comportamiento correcto.
      const workspace = getWorkspaceActions()

      switch (commandId) {
        case 'palette.open':
          setPaletteOpen(true)
          return
        case 'palette.close':
          setPaletteOpen(false)
          return

        case 'workspace.newChart':
          workspace?.addPanel('chart')
          return
        case 'workspace.newWatchlist':
          workspace?.addPanel('watchlist')
          return
        case 'workspace.newNews':
          workspace?.addPanel('news')
          return
        case 'workspace.duplicate':
          workspace?.duplicateActive()
          return
        case 'workspace.closePanel':
        case 'workspace.closePanelEsc':
          workspace?.closeActive()
          return
        case 'workspace.reset':
          workspace?.resetLayout()
          return

        case 'app.fullscreen':
          void ipc.window.toggleFullscreen()
          return

        default:
          return
      }
    },
    [navigate, setPaletteOpen],
  )
}
