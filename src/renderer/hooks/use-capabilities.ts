import { useQuery } from '@tanstack/react-query'
import type { Capability, CapabilityState, CapabilityStatus } from '@shared/domain'
import { ipc } from '../lib/ipc'

export const CAPABILITIES_QUERY_KEY = ['capabilities'] as const

export function useCapabilities(): CapabilityStatus[] {
  const { data } = useQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: () => ipc.providers.capabilities(),
    staleTime: 30_000,
  })

  return data ?? []
}

/**
 * Estado de una capacidad concreta.
 *
 * Es la vía por la que un componente pregunta "¿puedo mostrar noticias?" sin
 * saber nada de proveedores. Mientras se carga se asume `unavailable`, no
 * `available`: es preferible que la interfaz aparezca deshabilitada un instante
 * a que ofrezca algo y falle al pulsarlo.
 */
export function useCapability(capability: Capability): {
  state: CapabilityState
  reason: string | null
  provider: string | null
  isAvailable: boolean
} {
  const statuses = useCapabilities()
  const found = statuses.find((status) => status.capability === capability)

  return {
    state: found?.state ?? 'unavailable',
    reason: found?.reason ?? null,
    provider: found?.provider ?? null,
    isAvailable: found?.state === 'available',
  }
}
