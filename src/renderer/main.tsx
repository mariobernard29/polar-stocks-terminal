import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultSettings } from '@shared/settings'
import { App } from './App'
import { initI18n, type Language } from './i18n'
import { ipc } from './lib/ipc'
import { createQueryClient } from './lib/query-client'
import { SETTINGS_QUERY_KEY } from './hooks/use-settings'
import './styles/globals.css'

/**
 * Arranque del renderer.
 *
 * Los ajustes se piden ANTES del primer render y se siembran en la caché de
 * TanStack Query. Renderizar primero y corregir después produciría un
 * parpadeo visible: la aplicación aparecería en español y saltaría a inglés, o
 * cambiaría de densidad a la vista del usuario.
 *
 * Si la carga falla, se arranca con los valores por defecto en lugar de
 * quedarse en blanco: una preferencia perdida es mucho menos grave que una
 * ventana muerta.
 */
async function bootstrap(): Promise<void> {
  const container = document.getElementById('root')
  if (!container) throw new Error('No se encontró el elemento #root')

  const queryClient = createQueryClient()

  const settings = await ipc.settings.getAll().catch(() => defaultSettings())
  queryClient.setQueryData(SETTINGS_QUERY_KEY, settings)

  const language = settings['general.language'] as Language
  await initI18n(language)
  document.documentElement.lang = language
  document.documentElement.dataset['density'] = settings['appearance.density']
  document.documentElement.dataset['marketColors'] = settings['appearance.marketColors']

  createRoot(container).render(
    <StrictMode>
      <App queryClient={queryClient} />
    </StrictMode>,
  )
}

void bootstrap()
