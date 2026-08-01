import { create } from 'zustand'

/**
 * Estado de interfaz.
 *
 * Regla estricta: **aquí no entra ningún dato de mercado**. Cotizaciones,
 * noticias y ajustes viven en TanStack Query, que ya sabe cachear, reintentar e
 * invalidar. Este store es solo para lo que la interfaz recuerda sobre sí misma.
 */
interface UiState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  /**
   * Consulta del buscador.
   *
   * Vive en el store y no en el componente porque cerrarlo tiene que limpiarla,
   * y el cierre puede venir de tres sitios: la tecla Escape, un clic fuera o
   * haber elegido un resultado. Con estado local haría falta un efecto que
   * observara `open` para limpiar — que es justo el antipatrón de sincronizar
   * estado con estado.
   */
  commandQuery: string

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setCommandQuery: (query: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  commandQuery: '',

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  // Reabrir el buscador con la búsqueda anterior dentro obliga a borrarla
  // siempre: justo la fricción que se quiere evitar en algo que se abre cien
  // veces al día.
  setCommandPaletteOpen: (commandPaletteOpen) =>
    set(commandPaletteOpen ? { commandPaletteOpen } : { commandPaletteOpen, commandQuery: '' }),
  setCommandQuery: (commandQuery) => set({ commandQuery }),
}))
