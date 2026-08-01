import type {
  IpcChannel,
  IpcEventName,
  IpcEventPayload,
  IpcInput,
  IpcOutput,
} from './contract'
import type { IpcResult } from './errors'

/**
 * Los canales sin entrada (`z.void()`) no deberían obligar a escribir
 * `invoke('app:ping', undefined)`. Este tipo hace opcional el argumento solo
 * en esos casos, y obligatorio en el resto.
 */
export type InvokeArgs<K extends IpcChannel> = IpcInput<K> extends void
  ? [input?: undefined]
  : [input: IpcInput<K>]

/**
 * Forma de la API que el preload expone en `window.polar`.
 *
 * Vive en `shared` porque el renderer no puede importar del preload (lo impide
 * la regla de fronteras del lint), así que el contrato tiene que estar en la
 * única capa que ambos ven. El preload la implementa, el renderer la consume,
 * y el compilador garantiza que no se desincronicen.
 *
 * La superficie es deliberadamente diminuta: dos funciones. Todo lo demás se
 * construye encima en el renderer, donde no hay privilegios que filtrar.
 * Cuanto más pequeño el puente, menos hay que auditar.
 */
export interface PolarApi {
  /**
   * Llama a un canal del contrato. Devuelve el sobre sin abrir: es el cliente
   * del renderer quien lo deshace y lanza un `PolarError`.
   */
  invoke<K extends IpcChannel>(
    channel: K,
    ...args: InvokeArgs<K>
  ): Promise<IpcResult<IpcOutput<K>>>

  /**
   * Se suscribe a un evento push del main.
   * Devuelve la función para cancelar la suscripción.
   */
  subscribe<E extends IpcEventName>(
    event: E,
    listener: (payload: IpcEventPayload<E>) => void,
  ): () => void
}
