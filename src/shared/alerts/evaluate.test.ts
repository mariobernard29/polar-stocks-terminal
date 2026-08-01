import { describe, expect, it } from 'vitest'
import {
  evaluate,
  formatTriggerMessage,
  observedValue,
  type AlertRule,
  type ArmState,
  type Observation,
} from './evaluate'

const rule = (overrides: Partial<AlertRule> = {}): AlertRule => ({
  id: 'a1',
  symbol: 'AAPL',
  kind: 'price',
  condition: 'above',
  threshold: 200,
  enabled: true,
  once: true,
  ...overrides,
})

const at = (price: number, changePercent: number | null = null): Observation => ({
  price,
  changePercent,
})

/** Encadena observaciones y devuelve en qué momentos hubo disparo. */
function run(alert: AlertRule, observations: readonly Observation[]): boolean[] {
  let state: ArmState = null
  return observations.map((observation) => {
    const result = evaluate(alert, observation, state)
    state = result.state
    return result.triggered
  })
}

describe('evaluate', () => {
  it('la primera observación arma pero no dispara', () => {
    // Crear una alerta de «por encima de 200» con el precio ya en 210 no es
    // una noticia: es el estado en el que estaba el mundo al crearla.
    const result = evaluate(rule(), at(210), null)

    expect(result.triggered).toBe(false)
    expect(result.state).toBe(true)
    expect(result.value).toBe(210)
  })

  it('dispara al cruzar el umbral hacia arriba', () => {
    expect(run(rule(), [at(190), at(195), at(205)])).toEqual([false, false, true])
  })

  it('no vuelve a disparar mientras siga cumpliéndose', () => {
    // Este es el caso que hace o rompe la función: sin él, una alerta genera
    // una notificación cada 250 ms mientras el precio no baje.
    expect(run(rule(), [at(190), at(205), at(210), at(230), at(206)])).toEqual([
      false,
      true,
      false,
      false,
      false,
    ])
  })

  it('se rearma al dejar de cumplirse y vuelve a disparar', () => {
    expect(run(rule(), [at(190), at(205), at(195), at(210)])).toEqual([
      false,
      true,
      false,
      true,
    ])
  })

  it('«por debajo» funciona en el sentido contrario', () => {
    const below = rule({ condition: 'below', threshold: 100 })
    expect(run(below, [at(120), at(110), at(95), at(90), at(105), at(80)])).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ])
  })

  it('el umbral exacto no cuenta como superado', () => {
    // Comparación estricta: «por encima de 200» con el precio en 200 clavados
    // no se ha superado. Dispararlo sería avisar de algo que no ha pasado.
    expect(run(rule(), [at(190), at(200)])).toEqual([false, false])
    expect(run(rule(), [at(190), at(200.01)])).toEqual([false, true])
  })

  it('una alerta desactivada no dispara ni cambia de estado', () => {
    const result = evaluate(rule({ enabled: false }), at(300), false)

    expect(result.triggered).toBe(false)
    expect(result.state).toBe(false)
  })

  it('evalúa la variación porcentual cuando es su tipo', () => {
    const percent = rule({ kind: 'changePercent', threshold: 5 })
    const observations = [at(100, 1), at(101, 4.9), at(106, 6.2)]

    expect(run(percent, observations)).toEqual([false, false, true])
  })

  it('una variación negativa cruza un umbral negativo', () => {
    const percent = rule({ kind: 'changePercent', condition: 'below', threshold: -3 })
    expect(run(percent, [at(100, -1), at(97, -3.5)])).toEqual([false, true])
  })

  it('sin variación disponible conserva el estado en lugar de rearmar', () => {
    // Un tick del WebSocket trae precio pero no variación de sesión. Si eso se
    // interpretara como «no se cumple», la alerta se rearmaría y dispararía otra
    // vez en cuanto llegara una cotización completa, sin que el mercado se
    // hubiera movido.
    const percent = rule({ kind: 'changePercent', threshold: 5 })

    const armed = evaluate(percent, at(106, 6.2), false)
    expect(armed.triggered).toBe(true)

    const noData = evaluate(percent, at(106, null), armed.state)
    expect(noData.triggered).toBe(false)
    expect(noData.state).toBe(true)

    const stillHigh = evaluate(percent, at(106, 6.3), noData.state)
    expect(stillHigh.triggered).toBe(false)
  })

  it('ignora precios no finitos sin tocar el estado', () => {
    const result = evaluate(rule(), at(Number.NaN), false)

    expect(result.triggered).toBe(false)
    expect(result.state).toBe(false)
    expect(result.value).toBeNull()
  })
})

describe('observedValue', () => {
  it('toma el precio o la variación según el tipo', () => {
    expect(observedValue('price', at(150, 2))).toBe(150)
    expect(observedValue('changePercent', at(150, 2))).toBe(2)
  })

  it('devuelve null cuando el dato no es utilizable', () => {
    expect(observedValue('changePercent', at(150, null))).toBeNull()
    expect(observedValue('price', at(Number.POSITIVE_INFINITY))).toBeNull()
  })
})

describe('formatTriggerMessage', () => {
  it('describe el cruce en español', () => {
    const message = formatTriggerMessage(rule(), 205.5, 'es')

    expect(message).toContain('AAPL')
    expect(message).toContain('superado')
    expect(message).toContain('205,50')
  })

  it('describe el cruce en inglés', () => {
    const message = formatTriggerMessage(rule({ condition: 'below' }), 195.25, 'en')

    expect(message).toContain('fell below')
    expect(message).toContain('195.25')
  })

  it('la variación lleva signo y símbolo de porcentaje', () => {
    const percent = rule({ kind: 'changePercent', threshold: 5 })

    expect(formatTriggerMessage(percent, 6.2, 'es')).toContain('+6,20 %')
    expect(formatTriggerMessage(percent, -6.2, 'es')).toContain('-6,20 %')
  })
})
