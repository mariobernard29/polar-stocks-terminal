import { z } from 'zod'

/**
 * Códigos de error que cruzan el IPC.
 *
 * Son un conjunto cerrado a propósito: la UI decide qué mostrar a partir del
 * código, no parseando el texto del mensaje. Un mensaje se puede traducir o
 * reescribir sin romper nada; un código no.
 */
export const ipcErrorCodeSchema = z.enum([
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
  /** Cualquier otra cosa. Se registra con traza completa en el main. */
  'INTERNAL',
])
export type IpcErrorCode = z.infer<typeof ipcErrorCodeSchema>

export const ipcErrorSchema = z.object({
  code: ipcErrorCodeSchema,
  message: z.string(),
  /** Contexto adicional para depurar. Nunca debe contener secretos. */
  details: z.string().optional(),
  /** Si la operación tiene sentido reintentarla tal cual. */
  retryable: z.boolean(),
})
export type IpcErrorPayload = z.infer<typeof ipcErrorSchema>

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
