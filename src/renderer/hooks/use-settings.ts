import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Settings } from '@shared/settings'
import { defaultSettings } from '@shared/settings'
import { changeLanguage, type Language } from '../i18n'
import { ipc } from '../lib/ipc'

export const SETTINGS_QUERY_KEY = ['settings'] as const

export function useSettings(): Settings {
  const { data } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => ipc.settings.getAll(),
    // Los ajustes solo cambian cuando el usuario los cambia, y en ese caso
    // actualizamos la caché nosotros mismos: no hay motivo para revalidarlos.
    staleTime: Infinity,
  })

  return data ?? defaultSettings()
}

export function useUpdateSettings(): (patch: Partial<Settings>) => Promise<void> {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (patch: Partial<Settings>) => ipc.settings.update(patch),
    // El main devuelve el estado completo resultante, así que se siembra la
    // caché directamente en vez de invalidar y provocar otra ida y vuelta.
    onSuccess: (updated) => queryClient.setQueryData(SETTINGS_QUERY_KEY, updated),
  })

  return async (patch) => {
    await mutation.mutateAsync(patch)
  }
}

/**
 * Aplica los ajustes que afectan a toda la interfaz.
 *
 * Densidad y semántica de color viajan como atributos en `<html>`, no como
 * clases repartidas por los componentes: así el CSS reasigna cuatro variables y
 * la aplicación entera cambia sin volver a renderizar nada.
 */
export function useApplySettings(settings: Settings): void {
  const density = settings['appearance.density']
  const marketColors = settings['appearance.marketColors']
  const reduceMotion = settings['appearance.reduceMotion']
  const language = settings['general.language']

  useEffect(() => {
    document.documentElement.dataset['density'] = density
  }, [density])

  useEffect(() => {
    document.documentElement.dataset['marketColors'] = marketColors
  }, [marketColors])

  useEffect(() => {
    document.documentElement.dataset['reduceMotion'] = reduceMotion ? 'true' : 'false'
  }, [reduceMotion])

  useEffect(() => {
    void changeLanguage(language as Language)
  }, [language])
}
