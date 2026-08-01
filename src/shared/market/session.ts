import type { AssetClass, MarketState } from '../domain'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Sesión del mercado estadounidense
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Calcula si el mercado está en pre-apertura, abierto, after-hours o cerrado,
 * teniendo en cuenta fines de semana, festivos y cierres anticipados.
 *
 * Todo se calcula sobre la hora de Nueva York obtenida con `Intl`, nunca con
 * desplazamientos fijos: el horario de verano cambia dos veces al año y una
 * terminal que diga "abierto" a las 15:30 de un domingo, o el día de Acción de
 * Gracias, pierde toda su credibilidad.
 *
 * Módulo puro y sin dependencias: lo usan el proceso main (para etiquetar
 * cotizaciones) y el renderer (para la barra superior).
 */

export const NY_TIMEZONE = 'America/New_York'

/** Horario regular del NYSE/NASDAQ, en minutos desde medianoche de Nueva York. */
const PRE_MARKET_OPEN = 4 * 60 // 04:00
const REGULAR_OPEN = 9 * 60 + 30 // 09:30
const REGULAR_CLOSE = 16 * 60 // 16:00
const AFTER_HOURS_CLOSE = 20 * 60 // 20:00
/** En días de media sesión el cierre se adelanta a las 13:00. */
const EARLY_CLOSE = 13 * 60

export interface NyDateParts {
  year: number
  month: number
  day: number
  /** Minutos desde medianoche. */
  minutes: number
  /** 0 = domingo … 6 = sábado. */
  weekday: number
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NY_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hour12: false,
})

/** Descompone un instante en la fecha y hora que marca el reloj de Nueva York. */
export function toNyParts(at: Date): NyDateParts {
  const parts = nyFormatter.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '0'

  // `hour12: false` produce 24 en lugar de 0 para la medianoche en algunos
  // entornos; normalizarlo evita un desfase de un día completo en el cálculo.
  const hour = Number(get('hour')) % 24

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    minutes: hour * 60 + Number(get('minute')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

const dayKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/** Día de la semana de una fecha del calendario (algoritmo de Sakamoto). */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** N-ésima aparición de un día de la semana en un mes. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const firstWeekday = weekdayOf(year, month, 1)
  const offset = (weekday - firstWeekday + 7) % 7
  return 1 + offset + (nth - 1) * 7
}

/** Última aparición de un día de la semana en un mes. */
function lastWeekday(year: number, month: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lastDayWeekday = weekdayOf(year, month, daysInMonth)
  return daysInMonth - ((lastDayWeekday - weekday + 7) % 7)
}

/**
 * Regla de festivo observado: si cae en sábado se traslada al viernes
 * anterior; si cae en domingo, al lunes siguiente.
 */
function observed(year: number, month: number, day: number): [number, number, number] {
  const weekday = weekdayOf(year, month, day)
  if (weekday === 6) {
    return day === 1 ? [year, month, day] : [year, month, day - 1]
  }
  if (weekday === 0) return [year, month, day + 1]
  return [year, month, day]
}

/** Domingo de Pascua (algoritmo gregoriano anónimo). Necesario para Viernes Santo. */
function easterSunday(year: number): [number, number] {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return [month, day]
}

function subtractDays(year: number, month: number, day: number, amount: number): [number, number, number] {
  const date = new Date(Date.UTC(year, month - 1, day - amount))
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
}

const holidayCache = new Map<number, { closed: Set<string>; earlyClose: Set<string> }>()

/** Festivos y medias sesiones del NYSE para un año concreto. */
export function marketHolidays(year: number): {
  closed: ReadonlySet<string>
  earlyClose: ReadonlySet<string>
} {
  const cached = holidayCache.get(year)
  if (cached) return cached

  const closed = new Set<string>()
  const earlyClose = new Set<string>()
  const add = (target: Set<string>, [y, m, d]: [number, number, number]): void => {
    target.add(dayKey(y, m, d))
  }

  add(closed, observed(year, 1, 1)) // Año Nuevo
  add(closed, [year, 1, nthWeekday(year, 1, 1, 3)]) // Martin Luther King Jr.
  add(closed, [year, 2, nthWeekday(year, 2, 1, 3)]) // Washington
  add(closed, subtractDays(year, ...easterSunday(year), 2)) // Viernes Santo
  add(closed, [year, 5, lastWeekday(year, 5, 1)]) // Memorial Day
  add(closed, observed(year, 6, 19)) // Juneteenth
  add(closed, observed(year, 7, 4)) // Independencia
  add(closed, [year, 9, nthWeekday(year, 9, 1, 1)]) // Trabajo
  add(closed, observed(year, 12, 25)) // Navidad

  const thanksgiving = nthWeekday(year, 11, 4, 4)
  add(closed, [year, 11, thanksgiving])
  // Cierres anticipados a las 13:00.
  add(earlyClose, [year, 11, thanksgiving + 1]) // viernes tras Acción de Gracias
  add(earlyClose, [year, 12, 24]) // Nochebuena
  add(earlyClose, [year, 7, 3]) // víspera del 4 de julio

  const result = { closed, earlyClose }
  holidayCache.set(year, result)
  return result
}

export interface SessionInfo {
  readonly state: MarketState
  /** Si hoy la sesión cierra antes de lo normal. */
  readonly earlyClose: boolean
  /** Motivo del cierre, cuando aplica. Se muestra en la barra superior. */
  readonly reason: 'weekend' | 'holiday' | 'outsideHours' | null
}

/**
 * Estado de la sesión estadounidense en un instante dado.
 *
 * Cripto y forex no cierran: para esas clases de activo siempre es `open`.
 */
export function getSessionInfo(at: Date, assetClass?: AssetClass): SessionInfo {
  if (assetClass === 'crypto' || assetClass === 'forex') {
    return { state: 'open', earlyClose: false, reason: null }
  }

  const parts = toNyParts(at)

  if (parts.weekday === 0 || parts.weekday === 6) {
    return { state: 'closed', earlyClose: false, reason: 'weekend' }
  }

  const { closed, earlyClose } = marketHolidays(parts.year)
  const key = dayKey(parts.year, parts.month, parts.day)

  if (closed.has(key)) {
    return { state: 'closed', earlyClose: false, reason: 'holiday' }
  }

  const isEarly = earlyClose.has(key)
  const regularClose = isEarly ? EARLY_CLOSE : REGULAR_CLOSE

  if (parts.minutes >= PRE_MARKET_OPEN && parts.minutes < REGULAR_OPEN) {
    return { state: 'pre', earlyClose: isEarly, reason: null }
  }
  if (parts.minutes >= REGULAR_OPEN && parts.minutes < regularClose) {
    return { state: 'open', earlyClose: isEarly, reason: null }
  }
  if (parts.minutes >= regularClose && parts.minutes < AFTER_HOURS_CLOSE) {
    return { state: 'after', earlyClose: isEarly, reason: null }
  }

  return { state: 'closed', earlyClose: isEarly, reason: 'outsideHours' }
}

/** Atajo cuando solo interesa el estado. */
export function getMarketState(at: Date, assetClass?: AssetClass): MarketState {
  return getSessionInfo(at, assetClass).state
}
