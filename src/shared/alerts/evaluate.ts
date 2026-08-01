/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluación de alertas
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Módulo puro: sin base de datos, sin red, sin notificaciones. Decide una sola
 * cosa —si una observación debe disparar una alerta— y esa decisión es la que
 * determina si la función es útil o insoportable.
 *
 * **Se dispara al cruzar, no al estar.** Una alerta de «AAPL por encima de 200»
 * no salta en cada tick mientras el precio siga en 210: salta en el momento en
 * que pasa de no cumplirse a cumplirse. Sin esto, una sola alerta generaría una
 * notificación cada 250 ms y el usuario apagaría la función entera en un minuto.
 *
 * La consecuencia es que hace falta recordar el estado anterior de cada alerta.
 * La primera observación **nunca dispara**: solo arma la alerta. Si al crearla
 * el precio ya cumple la condición, la interfaz lo advierte en ese momento, que
 * es cuando el usuario puede hacer algo al respecto.
 */

export type AlertKind = 'price' | 'changePercent'
export type AlertCondition = 'above' | 'below'

export interface AlertRule {
  readonly id: string
  readonly symbol: string
  readonly kind: AlertKind
  readonly condition: AlertCondition
  readonly threshold: number
  readonly enabled: boolean
  /** Si se desactiva sola tras dispararse una vez. */
  readonly once: boolean
}

export interface Observation {
  readonly price: number
  /** Variación de la sesión. `null` si el proveedor no la aporta. */
  readonly changePercent: number | null
}

/**
 * Estado de armado de una alerta.
 *
 * `null` significa «todavía no se ha observado nada»: es el estado en el que
 * nace una alerta y el único en el que una observación no puede disparar.
 */
export type ArmState = boolean | null

export interface Evaluation {
  /** Si esta observación debe generar un disparo. */
  readonly triggered: boolean
  /** Estado de armado resultante, que el llamante debe conservar. */
  readonly state: ArmState
  /** Valor observado que se compara con el umbral. `null` si no se pudo medir. */
  readonly value: number | null
}

/** Extrae de la observación el valor que le corresponde a la alerta. */
export function observedValue(kind: AlertKind, observation: Observation): number | null {
  const value = kind === 'price' ? observation.price : observation.changePercent
  // `Number.isFinite` descarta de paso `null`, `NaN` e `Infinity`: comparar
  // cualquiera de los tres contra un umbral da un resultado sin sentido.
  return Number.isFinite(value) ? (value as number) : null
}

function satisfies(condition: AlertCondition, value: number, threshold: number): boolean {
  return condition === 'above' ? value > threshold : value < threshold
}

/**
 * Evalúa una observación contra una alerta.
 *
 * `previous` es el estado devuelto por la evaluación anterior de **esta misma**
 * alerta. Pasar `null` la primera vez es lo correcto: arma sin disparar.
 */
export function evaluate(
  rule: AlertRule,
  observation: Observation,
  previous: ArmState,
): Evaluation {
  if (!rule.enabled) return { triggered: false, state: previous, value: null }

  const value = observedValue(rule.kind, observation)
  // Sin dato medible el estado se conserva intacto. Tratar la ausencia como
  // «no se cumple» rearmaría la alerta, y al volver el dato dispararía un aviso
  // que no corresponde a ningún movimiento real del mercado.
  if (value === null) return { triggered: false, state: previous, value: null }

  const isSatisfied = satisfies(rule.condition, value, rule.threshold)

  // Primera observación: solo arma.
  if (previous === null) return { triggered: false, state: isSatisfied, value }

  return {
    triggered: !previous && isSatisfied,
    state: isSatisfied,
    value,
  }
}

/**
 * Texto del disparo.
 *
 * Se genera aquí y no en el renderer porque la notificación de escritorio la
 * emite el proceso principal, que no tiene i18next. Son dos idiomas y cuatro
 * frases: montar toda la maquinaria de traducción en el main para esto sería
 * desproporcionado.
 *
 * El mensaje se guarda ya formateado en el historial. Eso significa que un
 * disparo registrado en español sigue en español si luego se cambia el idioma:
 * es un registro de algo que ocurrió en un momento dado, y reescribirlo a
 * posteriori sería más raro que dejarlo.
 */
export function formatTriggerMessage(
  rule: AlertRule,
  value: number,
  locale: string,
): string {
  const spanish = !locale.startsWith('en')

  const amount =
    rule.kind === 'price'
      ? value.toLocaleString(spanish ? 'es' : 'en', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : `${value >= 0 ? '+' : ''}${value.toLocaleString(spanish ? 'es' : 'en', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} %`

  if (spanish) {
    const what = rule.kind === 'price' ? 'El precio' : 'La variación'
    const how = rule.condition === 'above' ? 'ha superado' : 'ha caído por debajo de'
    return `${rule.symbol}: ${what} ${how} el umbral. Valor actual ${amount}.`
  }

  const what = rule.kind === 'price' ? 'Price' : 'Change'
  const how = rule.condition === 'above' ? 'rose above' : 'fell below'
  return `${rule.symbol}: ${what} ${how} the threshold. Now ${amount}.`
}
