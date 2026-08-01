import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { type z } from 'zod'
import { EVENT_CHANNEL_PREFIX } from '@shared/ipc/channels'
import {
  IPC_CHANNELS,
  ipcContract,
  ipcEvents,
  type IpcChannel,
  type IpcEventName,
  type IpcEventPayload,
  type IpcInput,
  type IpcOutput,
} from '@shared/ipc/contract'
import type { IpcErrorPayload, IpcResult } from '@shared/ipc/errors'
import { AppError } from './app-error'
import { logger } from '../lib/logger'

/** Contexto que recibe cada handler. */
export interface HandlerContext {
  /** Ventana que originó la llamada, si sigue viva. */
  readonly window: BrowserWindow | null
}

export type IpcHandler<K extends IpcChannel> = (
  input: IpcInput<K>,
  context: HandlerContext,
) => Promise<IpcOutput<K>> | IpcOutput<K>

/**
 * Mapa de handlers para **todos** los canales del contrato.
 *
 * Al ser un tipo mapeado sobre `IpcChannel`, olvidar un canal es un error de
 * compilación. Es la mitad del trato: el contrato declara, esto obliga a
 * cumplirlo.
 */
export type IpcHandlers = { [K in IpcChannel]: IpcHandler<K> }

/** Formatea los problemas de zod de forma legible sin volcar el objeto entero. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

function toErrorPayload(error: unknown, channel: string): IpcErrorPayload {
  if (error instanceof AppError) return error.toPayload()

  // Un error inesperado se registra con traza completa en el main, pero al
  // renderer solo le llega un mensaje genérico: la traza puede contener rutas
  // del disco del usuario o fragmentos de respuestas de proveedores.
  logger.error(`[ipc] fallo no controlado en ${channel}`, error)
  return {
    code: 'INTERNAL',
    message: 'Error interno de la aplicación.',
    retryable: false,
  }
}

/**
 * Solo se aceptan llamadas de las ventanas de la propia aplicación.
 *
 * Sin esto, cualquier iframe incrustado (por ejemplo el widget de TradingView)
 * que consiguiera ejecutar código podría invocar canales del main.
 */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window !== null
}

export function registerIpcHandlers(handlers: IpcHandlers, options: { isDev: boolean }): void {
  for (const channel of IPC_CHANNELS) {
    const definition = ipcContract[channel]
    const handler = handlers[channel] as IpcHandler<IpcChannel>

    ipcMain.handle(channel, async (event, rawInput): Promise<IpcResult<unknown>> => {
      if (!isTrustedSender(event)) {
        logger.warn(`[ipc] llamada rechazada a ${channel}: emisor no reconocido`)
        return {
          ok: false,
          error: { code: 'INTERNAL', message: 'Emisor no autorizado.', retryable: false },
        }
      }

      // 1. Validar la entrada. Cumple «validar todas las entradas del usuario»
      //    en un único punto, sin depender de que cada handler se acuerde.
      const parsedInput = definition.input.safeParse(rawInput)
      if (!parsedInput.success) {
        logger.warn(`[ipc] entrada inválida en ${channel}: ${formatIssues(parsedInput.error)}`)
        return {
          ok: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Los datos enviados no son válidos.',
            details: formatIssues(parsedInput.error),
            retryable: false,
          },
        }
      }

      // 2. Ejecutar.
      let output: unknown
      try {
        output = await handler(parsedInput.data, {
          window: BrowserWindow.fromWebContents(event.sender),
        })
      } catch (error) {
        return { ok: false, error: toErrorPayload(error, channel) }
      }

      // 3. Validar la salida — solo en desarrollo. Detecta que un handler
      //    devuelva algo que no cumple el contrato en el momento de escribirlo,
      //    no seis meses después en casa de un usuario. En producción se omite
      //    porque el coste por llamada no compensa.
      if (options.isDev) {
        const parsedOutput = definition.output.safeParse(output)
        if (!parsedOutput.success) {
          logger.error(
            `[ipc] ${channel} devolvió algo fuera de contrato: ${formatIssues(parsedOutput.error)}`,
          )
          return {
            ok: false,
            error: {
              code: 'CONTRACT_VIOLATION',
              message: `El canal ${channel} devolvió datos fuera de contrato.`,
              details: formatIssues(parsedOutput.error),
              retryable: false,
            },
          }
        }
      }

      return { ok: true, data: output }
    })
  }

  logger.info(`[ipc] ${IPC_CHANNELS.length} canales registrados`)
}

/**
 * Emite un evento push hacia el renderer.
 *
 * Valida el payload contra el contrato antes de enviarlo: un evento mal
 * formado es un bug que conviene detectar en el emisor y no en el receptor.
 */
export function emitIpcEvent<E extends IpcEventName>(
  target: BrowserWindow | null,
  event: E,
  payload: IpcEventPayload<E>,
): void {
  if (!target || target.isDestroyed()) return

  const parsed = ipcEvents[event].safeParse(payload)
  if (!parsed.success) {
    logger.error(`[ipc] evento ${event} con payload inválido: ${formatIssues(parsed.error)}`)
    return
  }

  target.webContents.send(`${EVENT_CHANNEL_PREFIX}${event}`, parsed.data)
}
