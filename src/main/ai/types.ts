/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Proveedores de IA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Mismo principio que con los datos de mercado: se programa contra una
 * capacidad, no contra un nombre. La aplicación no sabe si detrás hay Anthropic,
 * OpenAI o Gemini; sabe que hay algo que recibe mensajes y devuelve texto en
 * trozos.
 *
 * Las claves nunca cruzan al renderer, igual que las de mercado: la petición
 * sale del proceso principal y al otro lado solo llegan los fragmentos de texto.
 */

export type AiProviderId = 'anthropic' | 'openai' | 'gemini'

export interface AiMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface AiRequest {
  /**
   * Clave del proveedor.
   *
   * Viaja en la petición y no en un cierre del adaptador: así no hay estado
   * mutable compartido entre los tres, y cambiar la clave en Configuración surte
   * efecto en la siguiente pregunta sin reconstruir nada.
   */
  readonly apiKey: string
  readonly system: string
  readonly messages: readonly AiMessage[]
  readonly model: string
  /**
   * Techo de la respuesta.
   *
   * El panel es una columna estrecha: una respuesta de tres mil palabras no se
   * lee, y además se paga.
   */
  readonly maxTokens: number
  readonly signal: AbortSignal
}

export interface AiProvider {
  readonly id: AiProviderId
  readonly displayName: string
  /** Modelo que se usa si el usuario no elige otro. */
  readonly defaultModel: string
  /** Modelos conocidos, para el desplegable de Configuración. */
  readonly knownModels: readonly string[]
  readonly docsUrl: string

  /**
   * Envía la conversación y va emitiendo el texto conforme llega.
   *
   * Devuelve trozos y no la respuesta entera porque un panel que se queda en
   * blanco diez segundos parece colgado. Con streaming, la primera palabra
   * aparece en menos de un segundo.
   */
  stream(request: AiRequest, onDelta: (text: string) => void): Promise<void>
}
