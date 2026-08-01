import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LayoutRecord, LayoutSummary } from '@shared/ipc/contract'
import { ipc } from '../../lib/ipc'

const LAYOUTS_KEY = ['layouts'] as const
const DEFAULT_LAYOUT_KEY = ['layouts', 'default'] as const

export interface LayoutsController {
  readonly list: LayoutSummary[]
  readonly defaultLayout: LayoutRecord | null
  readonly isLoading: boolean
  save: (name: string, state: string) => Promise<LayoutRecord>
  load: (id: string) => Promise<LayoutRecord | null>
  remove: (id: string) => Promise<void>
  setDefault: (id: string) => Promise<void>
}

/**
 * Acceso a las disposiciones guardadas.
 *
 * La disposición predeterminada se lee una sola vez y **no se revalida**: es la
 * semilla del espacio de trabajo, y refrescarla mientras el usuario trabaja
 * podría reemplazarle los paneles bajo las manos.
 */
export function useLayouts(): LayoutsController {
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: LAYOUTS_KEY,
    queryFn: () => ipc.layouts.list(),
    staleTime: 60_000,
  })

  const defaultQuery = useQuery({
    queryKey: DEFAULT_LAYOUT_KEY,
    queryFn: () => ipc.layouts.getDefault(),
    staleTime: Infinity,
    refetchOnMount: false,
  })

  const invalidate = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: LAYOUTS_KEY })
  }, [queryClient])

  const saveMutation = useMutation({
    mutationFn: ({ name, state }: { name: string; state: string }) =>
      ipc.layouts.save(name, state),
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => ipc.layouts.remove(id),
    onSuccess: invalidate,
  })

  const defaultMutation = useMutation({
    mutationFn: (id: string) => ipc.layouts.setDefault(id),
    onSuccess: invalidate,
  })

  return {
    list: listQuery.data ?? [],
    defaultLayout: defaultQuery.data ?? null,
    isLoading: listQuery.isLoading || defaultQuery.isLoading,
    save: (name, state) => saveMutation.mutateAsync({ name, state }),
    load: (id) => ipc.layouts.get(id),
    remove: (id) => removeMutation.mutateAsync(id),
    setDefault: (id) => defaultMutation.mutateAsync(id),
  }
}
