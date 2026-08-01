import { Notification, type BrowserWindow } from 'electron'
import type { AlertRecord } from '@shared/domain'
import { evaluate, formatTriggerMessage, type ArmState } from '@shared/alerts/evaluate'
import * as repo from '../db/repositories/alerts'
import { getAllSettings } from '../db/repositories/settings'
import { emitIpcEvent } from '../ipc/register'
import { logger } from '../lib/logger'
import { getRegistry } from '../providers'
import { getStreamStatus, onTicks, subscribeSymbol, unsubscribeSymbol } from '../realtime'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de alertas
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Vive en el proceso principal, y tiene que ser así: una alerta que solo se
 * evaluara mientras su pantalla estuviera abierta no sería una alerta.
 *
 * Dos fuentes de datos, por necesidad:
 *
 * **Sondeo** cada `POLL_INTERVAL_MS`. Es la vía principal y la única que
 * funciona para todo: índices, divisas y materias primas no tienen flujo en
 * vivo, y la variación porcentual de la sesión no viaja en los ticks —una
 * operación suelta no sabe con qué abrió el valor—.
 *
 * **Ticks** del WebSocket, cuando los hay. Solo sirven para alertas de precio,
 * pero bajan el aviso de un minuto a menos de un segundo, que en un umbral de
 * precio es la diferencia entre útil e inútil.
 *
 * El estado de armado se guarda **en memoria**. Al reiniciar la aplicación
 * todas las alertas vuelven a armarse con la primera observación, así que no
 * disparan por lo que ocurrió mientras estaba cerrada. Es deliberado:
 * notificar al arrancar «AAPL superó los 200» por un cruce de hace tres días,
 * cuando ya cotiza a 190, sería ruido con apariencia de aviso.
 */

/**
 * Un minuto.
 *
 * Es un compromiso con la cuota: el plan gratuito de Finnhub da 60 llamadas por
 * minuto, y cada símbolo vigilado consume una en cada vuelta. Con este intervalo
 * caben unas cuantas decenas de alertas sin acercarse al límite.
 */
const POLL_INTERVAL_MS = 60_000

/**
 * Espera antes del primer sondeo.
 *
 * Al arrancar, el renderer está pidiendo su panel inicial. Lanzar además una
 * ronda de cotizaciones compite por la misma cuota y hace que la ventana tarde
 * más en tener datos, que es lo que el usuario está mirando.
 */
const FIRST_POLL_DELAY_MS = 8_000

/** Estado de armado por id de alerta. Ver la nota de arriba sobre la memoria. */
const armState = new Map<string, ArmState>()

/** Símbolos que el motor tiene suscritos al flujo en vivo. */
const streamed = new Set<string>()

let timer: NodeJS.Timeout | null = null
let unsubscribeTicks: (() => void) | null = null
let targetWindow: BrowserWindow | null = null
let running = false

/**
 * Última variación porcentual conocida de cada símbolo.
 *
 * Los ticks no la traen. Sin este recuerdo, evaluar una alerta de variación al
 * llegar un tick daría «sin dato» siempre, y las alertas de porcentaje
 * dependerían por completo del sondeo aunque el precio ya se conozca.
 */
const lastChangePercent = new Map<string, number>()

interface Observation {
  readonly price: number
  readonly changePercent: number | null
}

/** Dispara una alerta: la registra, avisa al usuario y actualiza su estado. */
async function fire(alert: AlertRecord, value: number): Promise<void> {
  const language = (await getAllSettings().catch(() => null))?.['general.language'] ?? 'es'
  const message = formatTriggerMessage(alert, value, language)

  const trigger = await repo.recordTrigger(alert, value, message)

  // El aviso se emite al renderer aunque no haya notificación del sistema: el
  // centro de alertas de la aplicación es la garantía de que nada se pierde.
  emitIpcEvent(targetWindow, 'alerts:triggered', trigger)

  if (Notification.isSupported()) {
    try {
      const notification = new Notification({
        title: `Polar Stocks · ${alert.symbol}`,
        body: message,
      })
      // Al pulsar la notificación se trae la ventana al frente. Es lo que se
      // espera de un aviso: llevar a donde ha pasado algo.
      notification.on('click', () => {
        targetWindow?.show()
        targetWindow?.focus()
      })
      notification.show()
    } catch (error) {
      logger.error('[alerts] no se pudo mostrar la notificación', error)
    }
  }

  if (alert.once) {
    await repo.setAlertEnabled(alert.id, false)
    armState.delete(alert.id)
  }

  logger.info(`[alerts] disparada ${alert.symbol} ${alert.kind} ${alert.condition}`)
}

/** Evalúa un conjunto de alertas contra las observaciones disponibles. */
async function applyObservations(
  alerts: readonly AlertRecord[],
  observations: ReadonlyMap<string, Observation>,
): Promise<void> {
  for (const alert of alerts) {
    const observation = observations.get(alert.symbol.toUpperCase())
    if (!observation) continue

    const previous = armState.get(alert.id) ?? null
    const result = evaluate(alert, observation, previous)
    armState.set(alert.id, result.state)

    if (result.triggered && result.value !== null) {
      // En serie y no en paralelo: si diez alertas del mismo símbolo cruzan a
      // la vez, diez notificaciones simultáneas se pisan unas a otras en el
      // centro del sistema y el usuario no llega a leer ninguna.
      await fire(alert, result.value).catch((error: unknown) => {
        logger.error('[alerts] fallo al disparar', error)
      })
    }
  }
}

/** Ajusta las suscripciones al flujo en vivo a los símbolos vigilados. */
function syncStreamSubscriptions(symbols: ReadonlySet<string>): void {
  for (const symbol of streamed) {
    if (!symbols.has(symbol)) {
      unsubscribeSymbol(symbol)
      streamed.delete(symbol)
    }
  }

  for (const symbol of symbols) {
    if (streamed.has(symbol)) continue
    // `subscribeSymbol` devuelve `false` para lo que no admite tiempo real
    // (índices, y divisas o materias primas sin plan de pago). No es un error:
    // esos símbolos se cubren con el sondeo.
    if (subscribeSymbol(symbol)) streamed.add(symbol)
  }
}

/** Una vuelta de sondeo: pide cotizaciones y evalúa. */
async function poll(): Promise<void> {
  let alerts: AlertRecord[]
  try {
    alerts = await repo.listEnabledAlerts()
  } catch (error) {
    logger.error('[alerts] no se pudieron leer las alertas', error)
    return
  }

  // Se limpia el estado de las alertas que ya no existen o se desactivaron: si
  // se vuelven a activar deben rearmarse desde cero, no reanudar con un estado
  // de hace horas.
  const activeIds = new Set(alerts.map((alert) => alert.id))
  for (const id of armState.keys()) {
    if (!activeIds.has(id)) armState.delete(id)
  }

  const symbols = new Set(alerts.map((alert) => alert.symbol.toUpperCase()))
  syncStreamSubscriptions(symbols)

  if (symbols.size === 0) return

  const observations = new Map<string, Observation>()

  // En paralelo pero acotado por el número de símbolos distintos, que es
  // pequeño por definición: son los que el usuario ha decidido vigilar.
  await Promise.all(
    [...symbols].map(async (symbol) => {
      try {
        const quote = await getRegistry().execute('quote', { symbol })
        observations.set(symbol, {
          price: quote.price,
          changePercent: quote.changePercent,
        })
        if (Number.isFinite(quote.changePercent)) {
          lastChangePercent.set(symbol, quote.changePercent)
        }
      } catch (error) {
        // Un símbolo que falla no puede impedir la evaluación de los demás. Se
        // deja sin observación, y `evaluate` conserva su estado sin disparar.
        logger.warn(`[alerts] sin cotización para ${symbol}`, error)
      }
    }),
  )

  await applyObservations(alerts, observations)
}

/** Evaluación rápida con los ticks del flujo en vivo. */
function handleTicks(ticks: readonly { symbol: string; price: number }[]): void {
  void (async () => {
    try {
      const alerts = await repo.listEnabledAlerts()
      if (alerts.length === 0) return

      const observations = new Map<string, Observation>()
      for (const tick of ticks) {
        const symbol = tick.symbol.toUpperCase()
        observations.set(symbol, {
          price: tick.price,
          // La variación no viaja en el tick; se usa la última conocida por el
          // sondeo. Si nunca hubo, queda `null` y `evaluate` conserva el estado.
          changePercent: lastChangePercent.get(symbol) ?? null,
        })
      }

      await applyObservations(alerts, observations)
    } catch (error) {
      logger.error('[alerts] fallo al evaluar ticks', error)
    }
  })()
}

export function initAlerts(window: BrowserWindow): void {
  if (running) return
  running = true
  targetWindow = window

  unsubscribeTicks = onTicks(handleTicks)

  // `unref` no: este temporizador es la razón de que la aplicación siga
  // vigilando. Lo que sí hace falta es que el primero no compita con el
  // arranque del renderer.
  setTimeout(() => {
    void poll()
    timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
  }, FIRST_POLL_DELAY_MS)

  logger.info('[alerts] motor iniciado')
}

/**
 * Fuerza una vuelta de evaluación.
 *
 * Lo llama el handler al crear una alerta: así queda armada de inmediato con el
 * precio actual, en lugar de esperar hasta un minuto a la primera observación.
 */
export function refreshAlerts(): void {
  void poll()
}

/**
 * Arma una alerta recién creada y devuelve si su condición ya se cumplía.
 *
 * Esto último es lo que permite que la interfaz avise: como el motor dispara al
 * cruzar y no al estar, una alerta creada sobre una condición ya cumplida se
 * queda callada hasta que el valor salga y vuelva a entrar. Es el comportamiento
 * correcto, pero hay que decirlo o parece que la alerta no funciona.
 *
 * Si la cotización no se puede consultar se devuelve `null` en lugar de un
 * `false` optimista: no es lo mismo «no se cumple» que «no lo sé».
 */
export async function armNewAlert(alert: AlertRecord): Promise<{
  alreadySatisfied: boolean | null
  currentValue: number | null
}> {
  const symbol = alert.symbol.toUpperCase()

  try {
    const quote = await getRegistry().execute('quote', { symbol })
    if (Number.isFinite(quote.changePercent)) {
      lastChangePercent.set(symbol, quote.changePercent)
    }

    const result = evaluate(
      alert,
      { price: quote.price, changePercent: quote.changePercent },
      null,
    )
    armState.set(alert.id, result.state)

    return { alreadySatisfied: result.state, currentValue: result.value }
  } catch (error) {
    logger.warn(`[alerts] no se pudo armar ${symbol} al crearla`, error)
    return { alreadySatisfied: null, currentValue: null }
  }
}

/** Estado del motor, para que la interfaz pueda ser honesta sobre qué vigila. */
export function getAlertCapabilities(): {
  canEvaluate: boolean
  canNotify: boolean
  pollIntervalMs: number
  streaming: boolean
} {
  return {
    canEvaluate: getRegistry()
      .capabilityStatuses()
      .some((status) => status.capability === 'quote' && status.state !== 'unavailable'),
    canNotify: Notification.isSupported(),
    pollIntervalMs: POLL_INTERVAL_MS,
    streaming: getStreamStatus() === 'open',
  }
}

export function shutdownAlerts(): void {
  if (timer) clearInterval(timer)
  timer = null
  unsubscribeTicks?.()
  unsubscribeTicks = null
  for (const symbol of streamed) unsubscribeSymbol(symbol)
  streamed.clear()
  armState.clear()
  lastChangePercent.clear()
  running = false
}
