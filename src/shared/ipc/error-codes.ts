/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Errores del IPC, sin zod
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Mismo corte que separa `channels.ts` de `contract.ts`: los nombres por un
 * lado, la validación por otro.
 *
 * El motivo es de capas. Quien valida es el proceso principal —es el único que
 * recibe datos de fuera—; el renderer solo necesita el código del error para
 * decidir qué enseñar. Que `PolarError`, usado en siete archivos de la interfaz,
 * arrastrara consigo toda una librería de validación era una frontera mal
 * puesta.
 *
 * El efecto de paso es que el trozo de arranque adelgaza 135 kB. Conviene no
 * exagerarlo: medido sobre cinco arranques, el tiempo hasta el primer contenido
 * apenas se movió (~1112 ms antes, ~1092 ms después). El arranque no está
 * limitado por analizar JavaScript.
 */

/**
 * Códigos de error que cruzan el IPC.
 *
 * Son un conjunto cerrado a propósito: la UI decide qué mostrar a partir del
 * código, no parseando el texto del mensaje. Un mensaje se puede traducir o
 * reescribir sin romper nada; un código no.
 */
export const IPC_ERROR_CODES = [
  /** El input no pasó la validación del contrato. Casi siempre un bug nuestro. */
  'VALIDATION_FAILED',
  /** La respuesta del handler no cumple el contrato. Bug nuestro, no del usuario. */
  'CONTRACT_VIOLATION',
  /** Ningún proveedor configurado cubre la capacidad pedida. */
  'PROVIDER_UNAVAILABLE',
  /** Cuota del proveedor agotada. Reintentable más tarde. */
  'RATE_LIMITED',
  /** El proveedor respondió, pero no tiene ese dato. */
  'NOT_FOUND',
  /** Fallo de red hablando con un proveedor externo. Reintentable. */
  'NETWORK_ERROR',
  /** Fallo leyendo o escribiendo la base de datos local. */
  'DATABASE_ERROR',
  /** El usuario no ha configurado la credencial necesaria. */
  'MISSING_CREDENTIAL',
  /**
   * El usuario abortó la operación.
   *
   * Tiene código propio para que la interfaz no lo pinte en rojo: cancelar una
   * respuesta de la IA a media escritura es una acción normal, no un fallo.
   */
  'CANCELLED',
  /** Cualquier otra cosa. Se registra con traza completa en el main. */
  'INTERNAL',
] as const

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number]

export interface IpcErrorPayload {
  readonly code: IpcErrorCode
  readonly message: string
  /** Contexto adicional para depurar. Nunca debe contener secretos. */
  readonly details?: string | undefined
  /** Si la operación tiene sentido reintentarla tal cual. */
  readonly retryable: boolean
}

/**
 * Sobre de respuesta.
 *
 * Los handlers nunca lanzan a través del IPC: devuelven este sobre. Motivo:
 * Electron serializa los `Error` perdiendo cualquier propiedad personalizada,
 * así que un `throw` convierte un error tipado en una cadena inútil. Con el
 * sobre, el código y el flag de reintento llegan intactos.
 *
 * El cliente del renderer deshace el sobre y vuelve a lanzar un error rico,
 * para que el código de UI use try/catch normal y TanStack Query lo entienda.
 */
export type IpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: IpcErrorPayload }

/** Error tipado que ve el renderer tras deshacer el sobre. */
export class PolarError extends Error {
  readonly code: IpcErrorCode
  readonly details: string | undefined
  readonly retryable: boolean

  constructor(payload: IpcErrorPayload) {
    super(payload.message)
    this.name = 'PolarError'
    this.code = payload.code
    this.details = payload.details
    this.retryable = payload.retryable
  }
}
