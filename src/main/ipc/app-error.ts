import type { IpcErrorCode, IpcErrorPayload } from '@shared/ipc/errors'

/**
 * Error de dominio del proceso main.
 *
 * Los handlers lanzan esto; el registrador lo convierte en el sobre que viaja
 * por IPC. Lanzar es más cómodo de escribir que devolver sobres a mano en cada
 * rama, y el punto de conversión está en un solo sitio.
 */
export class AppError extends Error {
  readonly code: IpcErrorCode
  readonly details: string | undefined
  readonly retryable: boolean

  constructor(
    code: IpcErrorCode,
    message: string,
    options?: { details?: string; retryable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AppError'
    this.code = code
    this.details = options?.details
    // Los errores de red y de cuota se reintentan; los bugs de contrato no.
    this.retryable = options?.retryable ?? DEFAULT_RETRYABLE.has(code)
  }

  toPayload(): IpcErrorPayload {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
      retryable: this.retryable,
    }
  }
}

const DEFAULT_RETRYABLE: ReadonlySet<IpcErrorCode> = new Set<IpcErrorCode>([
  'RATE_LIMITED',
  'NETWORK_ERROR',
])
