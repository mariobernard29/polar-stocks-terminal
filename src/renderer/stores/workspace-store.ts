import { create } from 'zustand'

/**
 * Acciones del espacio de trabajo, publicadas para quien esté fuera de él.
 *
 * Los atajos globales y el buscador viven en el shell, pero necesitan abrir o
 * cerrar paneles. Sin este registro habría que propagar callbacks a través del
 * router y varios componentes intermedios que no pintan nada al respecto.
 *
 * El espacio de trabajo publica sus acciones al montarse y las retira al
 * desmontarse. Cuando el usuario está en otra sección, quedan a `null` y quien
 * las invoque simplemente no hace nada — que es el comportamiento correcto: no
 * tiene sentido "cerrar el panel activo" desde la pantalla de Configuración.
 */
export interface WorkspaceActions {
  addPanel: (type: string, params?: Record<string, unknown>) => void
  duplicateActive: () => void
  closeActive: () => void
  resetLayout: () => void
}

interface WorkspaceState {
  actions: WorkspaceActions | null
  register: (actions: WorkspaceActions) => void
  unregister: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  actions: null,
  register: (actions) => set({ actions }),
  unregister: () => set({ actions: null }),
}))

/** Acceso desde fuera de React (atajos de teclado, por ejemplo). */
export function getWorkspaceActions(): WorkspaceActions | null {
  return useWorkspaceStore.getState().actions
}
