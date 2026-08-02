import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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

  performance.mark('boot:inicio')

  // Los valores por defecto se cargan solo si la lectura falla. Importarlos de
  // oficio arrastraría el catálogo de ajustes —y con él zod— al trozo de
  // arranque, para una vía que casi nunca se recorre.
  const settings = await ipc.settings
    .getAll()
    .catch(async () => (await import('@shared/settings-defaults')).defaultSettings())
  queryClient.setQueryData(SETTINGS_QUERY_KEY, settings)

  performance.mark('boot:ajustes')

  const language = settings['general.language'] as Language
  await initI18n(language)

  performance.mark('boot:i18n')
  document.documentElement.lang = language
  document.documentElement.dataset['density'] = settings['appearance.density']
  document.documentElement.dataset['marketColors'] = settings['appearance.marketColors']

  createRoot(container).render(
    <StrictMode>
      <App queryClient={queryClient} />
    </StrictMode>,
  )

  performance.mark('boot:render')
}

void bootstrap()
