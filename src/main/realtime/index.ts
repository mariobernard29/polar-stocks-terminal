import type { BrowserWindow } from 'electron'
import { emitIpcEvent } from '../ipc/register'
import { logger } from '../lib/logger'
import { FinnhubStream, type StreamStatus, type Trade } from './finnhub-stream'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestor de tiempo real
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Entre el WebSocket y la interfaz hacen falta dos cosas que el transporte no
 * debe conocer:
 *
 * **1. Conteo de referencias.** Un gráfico de AAPL y una watchlist con AAPL son
 * dos suscriptores del mismo símbolo. Sin contar, cerrar uno cancelaría el
 * flujo del otro; y sin contar tampoco se sabría cuándo dejar de escuchar de
 * verdad.
 *
 * **2. Agrupación temporal.** Una acción líquida puede generar cientos de
 * operaciones por segundo. Reenviar cada una por IPC saturaría el puente y
 * provocaría una tormenta de repintados en React para mostrar un precio que el
 * ojo no distingue. Se guarda la última por símbolo y se envía un lote cada
 * `FLUSH_INTERVAL_MS`.
 */

/** Cuatro envíos por segundo: fluido a la vista y barato para el renderer. */
const FLUSH_INTERVAL_MS = 250

/** Suscriptores por símbolo canónico. */
const refCounts = new Map<string, number>()

/** Última operación por símbolo, pendiente de enviar. */
const pending = new Map<string, Trade>()

let stream: FinnhubStream | null = null
let flushTimer: NodeJS.Timeout | null = null
let targetWindow: BrowserWindow | null = null
let lastStatus: StreamStatus = 'closed'

function flush(): void {
  if (pending.size === 0) return

  const ticks = [...pending.values()].map((trade) => ({
    symbol: trade.symbol,
    price: trade.price,
    timestamp: trade.timestamp,
    volume: trade.volume,
  }))
  pending.clear()

  emitIpcEvent(targetWindow, 'market:ticks', ticks)
}

function startFlushing(): void {
  if (flushTimer) return
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
}

function stopFlushing(): void {
  if (!flushTimer) return
  clearInterval(flushTimer)
  flushTimer = null
  pending.clear()
}

export function initRealtime(window: BrowserWindow, getToken: () => string | null): void {
  targetWindow = window

  stream = new FinnhubStream(
    getToken,
    (trade) => {
      // Solo se retiene la última por símbolo: entre dos envíos, las
      // intermedias no aportan nada a lo que se ve.
      pending.set(trade.symbol, trade)
    },
    (status) => {
      lastStatus = status
      emitIpcEvent(targetWindow, 'market:streamStatus', status)
    },
  )
}

export function getStreamStatus(): StreamStatus {
  return lastStatus
}

/** Añade un suscriptor. Devuelve si el símbolo admite tiempo real. */
export function subscribeSymbol(symbol: string): boolean {
  if (!stream) return false

  const upper = symbol.toUpperCase()
  const current = refCounts.get(upper) ?? 0

  if (current === 0) {
    const accepted = stream.subscribe(upper)
    if (!accepted) return false
    startFlushing()
  }

  refCounts.set(upper, current + 1)
  return true
}

/** Quita un suscriptor. Solo se cancela el flujo cuando no queda ninguno. */
export function unsubscribeSymbol(symbol: string): void {
  if (!stream) return

  const upper = symbol.toUpperCase()
  const current = refCounts.get(upper) ?? 0
  if (current === 0) return

  if (current === 1) {
    refCounts.delete(upper)
    pending.delete(upper)
    stream.unsubscribe(upper)
    if (refCounts.size === 0) stopFlushing()
  } else {
    refCounts.set(upper, current - 1)
  }
}

/**
 * Cancela todas las suscripciones.
 *
 * Se llama cuando el renderer se recarga: los paneles anteriores ya no existen,
 * y sin esto sus referencias quedarían contadas para siempre y el socket
 * abierto sin nadie escuchando.
 */
export function resetSubscriptions(): void {
  for (const symbol of [...refCounts.keys()]) stream?.unsubscribe(symbol)
  refCounts.clear()
  stopFlushing()
  logger.info('[realtime] suscripciones reiniciadas')
}

export function shutdownRealtime(): void {
  stopFlushing()
  refCounts.clear()
  stream?.close()
  stream = null
  targetWindow = null
}
