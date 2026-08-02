import { z } from 'zod'
import { IPC_ERROR_CODES } from './error-codes'

/**
 * Validación de los errores del IPC.
 *
 * Los códigos, los tipos y la clase `PolarError` viven en `error-codes.ts`, sin
 * zod. Es una cuestión de capas: valida quien recibe datos de fuera, y eso es el
 * proceso principal. El renderer recibe errores ya validados desde el otro lado
 * del puente y solo necesita su código.
 */

export const ipcErrorCodeSchema = z.enum(IPC_ERROR_CODES)

export const ipcErrorSchema = z.object({
  code: ipcErrorCodeSchema,
  message: z.string(),
  /** Contexto adicional para depurar. Nunca debe contener secretos. */
  details: z.string().optional(),
  /** Si la operación tiene sentido reintentarla tal cual. */
  retryable: z.boolean(),
})

// Reexportados para no obligar a importar de dos sitios a quien ya valida.
export {
  IPC_ERROR_CODES,
  PolarError,
  type IpcErrorCode,
  type IpcErrorPayload,
  type IpcResult,
} from './error-codes'
