import { fromStreamSymbol, toStreamSymbol } from '@shared/market/stream-symbols'
import { logger } from '../lib/logger'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Flujo en tiempo real de Finnhub
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Transporte puro: abre el WebSocket, mantiene las suscripciones y entrega las
 * operaciones. El conteo de referencias y la limitación de frecuencia viven en
 * el gestor, que es agnóstico del proveedor.
 *
 * Reconecta con retroceso exponencial y **vuelve a suscribir** lo que estuviera
 * activo. Sin eso, un corte de red de tres segundos dejaría los paneles
 * congelados hasta que el usuario los reabriera, sin ninguna señal de que algo
 * va mal.
 */

const WS_URL = 'wss://ws.finnhub.io'

/** Reintentos: 1 s, 2 s, 4 s… hasta 30 s. */
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

/**
 * Espera antes de cerrar un socket sin suscriptores.
 *
 * Cubre el hueco entre desmontar un panel y volver a montarlo al navegar, que
 * es de milisegundos.
 */
const IDLE_CLOSE_DELAY_MS = 5_000

export interface Trade {
  readonly symbol: string
  readonly price: number
  readonly timestamp: number
  readonly volume: number | null
}

export type StreamStatus = 'connecting' | 'open' | 'closed'


export class FinnhubStream {
  #socket: WebSocket | null = null
  #status: StreamStatus = 'closed'
  #reconnectAttempt = 0
  #reconnectTimer: NodeJS.Timeout | null = null
  #closedByUs = false
  #idleTimer: NodeJS.Timeout | null = null

  /** Símbolos de flujo actualmente suscritos. */
  readonly #subscribed = new Set<string>()

  constructor(
    private readonly getToken: () => string | null,
    private readonly onTrade: (trade: Trade) => void,
    private readonly onStatus: (status: StreamStatus) => void,
  ) {}

  get status(): StreamStatus {
    return this.#status
  }

  #setStatus(status: StreamStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.onStatus(status)
  }

  connect(): void {
    if (this.#socket || this.#status === 'connecting') return

    const token = this.getToken()
    if (!token) {
      logger.warn('[realtime] sin clave de Finnhub: no se abre el flujo')
      return
    }

    this.#closedByUs = false
    this.#setStatus('connecting')

    const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    this.#socket = socket

    socket.addEventListener('open', () => {
      this.#reconnectAttempt = 0
      this.#setStatus('open')
      logger.info('[realtime] flujo de Finnhub abierto')
      // Vuelve a suscribir lo que hubiera antes del corte.
      for (const streamSymbol of this.#subscribed) this.#send('subscribe', streamSymbol)
    })

    socket.addEventListener('message', (event) => this.#handleMessage(String(event.data)))

    socket.addEventListener('error', () => {
      // El evento de error del WebSocket no trae detalle útil; el cierre que
      // viene detrás es el que lleva la información.
      logger.warn('[realtime] error en el flujo de Finnhub')
    })

    socket.addEventListener('close', (event) => {
      this.#socket = null
      this.#setStatus('closed')
      if (this.#closedByUs) return

      logger.warn(`[realtime] flujo cerrado (código ${event.code}); se reintentará`)
      this.#scheduleReconnect()
    })
  }

  #handleMessage(raw: string): void {
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }

    const message = payload as { type?: string; data?: unknown }
    if (message.type !== 'trade' || !Array.isArray(message.data)) return

    for (const entry of message.data) {
      const trade = entry as { s?: string; p?: number; t?: number; v?: number }
      if (typeof trade.s !== 'string' || typeof trade.p !== 'number') continue

      this.onTrade({
        symbol: fromStreamSymbol(trade.s),
        price: trade.p,
        timestamp: typeof trade.t === 'number' ? trade.t : Date.now(),
        volume: typeof trade.v === 'number' ? trade.v : null,
      })
    }
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer) return

    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.#reconnectAttempt,
    )
    this.#reconnectAttempt += 1

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      // Sin suscripciones vivas no hay motivo para reconectar: se hará sola
      // cuando alguien vuelva a pedir un símbolo.
      if (this.#subscribed.size > 0) this.connect()
    }, delay)
  }

  #send(type: 'subscribe' | 'unsubscribe', symbol: string): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return
    this.#socket.send(JSON.stringify({ type, symbol }))
  }

  subscribe(symbol: string): boolean {
    const streamSymbol = toStreamSymbol(symbol)
    if (!streamSymbol || this.#subscribed.has(streamSymbol)) return streamSymbol !== null

    // Si había un cierre por inactividad pendiente, se cancela: vuelve a haber
    // quien escuche.
    this.#cancelIdleClose()

    this.#subscribed.add(streamSymbol)
    if (this.#status === 'open') {
      this.#send('subscribe', streamSymbol)
    } else {
      this.connect()
    }
    return true
  }

  unsubscribe(symbol: string): void {
    const streamSymbol = toStreamSymbol(symbol)
    if (!streamSymbol || !this.#subscribed.delete(streamSymbol)) return

    this.#send('unsubscribe', streamSymbol)

    /**
     * Cierre diferido, no inmediato.
     *
     * Cerrar en cuanto se va el último suscriptor parecía razonable, pero en la
     * práctica provocaba un bucle: al navegar entre secciones, el renderer
     * desmonta sus paneles y los vuelve a montar en el mismo instante. El socket
     * se cerraba y se reabría varias veces por segundo, y Finnhub respondía con
     * cierres anómalos (código 1006) — martilleando su endpoint con el riesgo de
     * que bloqueara la clave.
     *
     * Con la espera, una navegación normal ni siquiera llega a cerrar la
     * conexión; solo se cierra si de verdad nadie vuelve a suscribirse.
     */
    if (this.#subscribed.size === 0) this.#scheduleIdleClose()
  }

  #scheduleIdleClose(): void {
    if (this.#idleTimer) return

    this.#idleTimer = setTimeout(() => {
      this.#idleTimer = null
      // Puede haber vuelto a suscribirse alguien mientras se esperaba.
      if (this.#subscribed.size === 0) this.close()
    }, IDLE_CLOSE_DELAY_MS)
  }

  #cancelIdleClose(): void {
    if (!this.#idleTimer) return
    clearTimeout(this.#idleTimer)
    this.#idleTimer = null
  }

  close(): void {
    this.#closedByUs = true
    this.#cancelIdleClose()
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
    this.#socket?.close()
    this.#socket = null
    this.#setStatus('closed')
  }
}
