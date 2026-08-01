import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'
import { es } from './locales/es'

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * Configuración de i18n.
 *
 * Sin detección automática desde el navegador: el idioma es una preferencia
 * guardada del usuario y la fuente de verdad es la base de datos. Detectarlo
 * del sistema haría que la aplicación cambiara de idioma sola al arrancar,
 * ignorando lo que el usuario eligió.
 */
export async function initI18n(language: Language): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: language,
    fallbackLng: 'es',
    interpolation: {
      // React ya escapa todo lo que renderiza; volver a escapar aquí produciría
      // entidades HTML visibles en pantalla.
      escapeValue: false,
    },
    returnNull: false,
  })
}

export async function changeLanguage(language: Language): Promise<void> {
  await i18next.changeLanguage(language)
  document.documentElement.lang = language
}

export { i18next }
