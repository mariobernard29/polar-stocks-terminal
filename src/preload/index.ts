import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  EVENT_CHANNEL_PREFIX,
  IPC_CHANNEL_NAMES,
  IPC_EVENT_NAMES,
} from '@shared/ipc/channels'
import type { PolarApi } from '@shared/ipc/api'
import type { IpcResult } from '@shared/ipc/errors'

/**
 * Único puente entre el renderer y el proceso main.
 *
 * Dos funciones, nada más. No se expone `ipcRenderer`, ni `require`, ni ningún
 * módulo de Node: si esto creciera, crecería también la superficie que hay que
 * auditar cada vez que se toca seguridad.
 *
 * Importa de `@shared/ipc/channels` y NO de `contract`: el contrato arrastra
 * zod, y un preload en sandbox no puede cargar módulos npm en tiempo de
 * ejecución. Ver el comentario en `channels.ts`.
 */

// Lista blanca construida desde los nombres del contrato. Es un control de
// seguridad, no una comodidad: sin ella, código inyectado en el renderer podría
// invocar cualquier canal que exista en el main, incluidos los internos.
const allowedChannels = new Set<string>(IPC_CHANNEL_NAMES)
const allowedEvents = new Set<string>(IPC_EVENT_NAMES)

const rejected = (message: string): Promise<IpcResult<never>> =>
  Promise.resolve({
    ok: false,
    error: { code: 'INTERNAL', message, retryable: false },
  })

const invoke = (channel: string, input?: unknown): Promise<IpcResult<unknown>> => {
  if (!allowedChannels.has(channel)) {
    return rejected(`Canal no permitido: ${channel}`)
  }
  return ipcRenderer.invoke(channel, input) as Promise<IpcResult<unknown>>
}

const subscribe = (event: string, listener: (payload: unknown) => void): (() => void) => {
  if (!allowedEvents.has(event)) return () => {}

  const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
  const ipcChannel = `${EVENT_CHANNEL_PREFIX}${event}`

  ipcRenderer.on(ipcChannel, wrapped)
  return () => {
    ipcRenderer.off(ipcChannel, wrapped)
  }
}

// Las firmas genéricas de `PolarApi` no se pueden implementar directamente sin
// perder el tipado; se acotan aquí y se afirma el tipo en un único punto.
const api: PolarApi = {
  invoke: invoke as PolarApi['invoke'],
  subscribe: subscribe as PolarApi['subscribe'],
}

contextBridge.exposeInMainWorld('polar', api)
