/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Parser del buscador universal
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Una sola caja de texto que entiende `AAPL`, `AAPL chart`, `BTC noticias`,
 * `NVDA fundamentales`. Es la forma de trabajar de una terminal: escribir en vez
 * de navegar por menús.
 *
 * Módulo puro y sin dependencias, deliberadamente separado de la interfaz: el
 * comportamiento del buscador es la parte que más conviene tener probada, y
 * probarlo a través de un componente sería lento y frágil.
 *
 * Los verbos se reconocen en **español e inglés** porque la aplicación es
 * bilingüe y nadie cambia su forma de teclear al cambiar el idioma de la
 * interfaz. También se aceptan abreviaturas de una letra: quien usa esto a
 * diario escribe `AAPL g`, no `AAPL gráfico`.
 */

export type AssetAction = 'overview' | 'chart' | 'news' | 'financials' | 'earnings' | 'metrics'

/** Sinónimos aceptados por acción. Todo en minúsculas y sin tildes. */
const ACTION_ALIASES: Readonly<Record<Exclude<AssetAction, 'overview'>, readonly string[]>> = {
  chart: ['chart', 'grafico', 'graph', 'g', 'c'],
  news: ['news', 'noticias', 'noticia', 'n'],
  financials: ['financials', 'financieros', 'fundamentales', 'fundamentals', 'f'],
  earnings: ['earnings', 'resultados', 'e'],
  metrics: ['metrics', 'metricas', 'm'],
}

/** Quita tildes para que `métricas` y `metricas` se comporten igual. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const ACTION_BY_ALIAS = new Map<string, AssetAction>()
for (const [action, aliases] of Object.entries(ACTION_ALIASES)) {
  for (const alias of aliases) {
    ACTION_BY_ALIAS.set(alias, action as AssetAction)
  }
}

/**
 * Forma plausible de símbolo: letras, dígitos y los signos que usan índices
 * (`^GSPC`), pares de divisas y algunos tickers (`BRK.B`, `RDS-A`).
 *
 * Deliberadamente permisivo. Aquí no se valida que el símbolo **exista** —de eso
 * se encarga el proveedor—, solo que el texto tenga pinta de símbolo y no de
 * frase de búsqueda.
 */
const SYMBOL_PATTERN = /^[\^]?[A-Za-z][A-Za-z0-9.\-:]{0,15}$/

export interface CommandParseResult {
  /** Texto original, normalizado en espacios. */
  readonly raw: string
  /** Símbolo canónico (mayúsculas) si el texto empieza por algo con esa forma. */
  readonly symbol: string | null
  /** Acción pedida. `overview` cuando solo se escribió el símbolo. */
  readonly action: AssetAction
  /** Si el verbo se escribió explícitamente. La interfaz lo muestra distinto. */
  readonly hasExplicitAction: boolean
  /**
   * Texto para búsqueda libre por nombre. Es el texto completo cuando no hay
   * símbolo reconocible ("banco santander"), o vacío cuando el comando ya está
   * completamente entendido.
   */
  readonly freeText: string
}

const EMPTY: CommandParseResult = {
  raw: '',
  symbol: null,
  action: 'overview',
  hasExplicitAction: false,
  freeText: '',
}

export function parseCommand(input: string): CommandParseResult {
  const raw = input.trim().replace(/\s+/g, ' ')
  if (raw.length === 0) return EMPTY

  const tokens = raw.split(' ')
  const [first, second, ...rest] = tokens

  if (!first) return EMPTY

  const looksLikeSymbol = SYMBOL_PATTERN.test(first)

  // Sin forma de símbolo → búsqueda libre por nombre ("banco santander").
  if (!looksLikeSymbol) {
    return { raw, symbol: null, action: 'overview', hasExplicitAction: false, freeText: raw }
  }

  const symbol = first.toUpperCase()

  // Solo el símbolo: se muestra la ficha del activo.
  if (second === undefined) {
    return { raw, symbol, action: 'overview', hasExplicitAction: false, freeText: raw }
  }

  const action = ACTION_BY_ALIAS.get(normalize(second))

  // Segundo token que no es un verbo conocido → probablemente el usuario está
  // escribiendo un nombre ("apple inc"), no un comando. Se trata como búsqueda
  // libre, pero se conserva el símbolo candidato por si acierta.
  if (!action) {
    return { raw, symbol, action: 'overview', hasExplicitAction: false, freeText: raw }
  }

  // Verbo reconocido pero con más texto detrás ("AAPL chart algo"): no es un
  // comando limpio, así que se degrada a búsqueda en vez de adivinar.
  if (rest.length > 0) {
    return { raw, symbol, action: 'overview', hasExplicitAction: false, freeText: raw }
  }

  return { raw, symbol, action, hasExplicitAction: true, freeText: '' }
}

/** Acciones que ya tienen panel en la Fase 1. El resto llegan en fases posteriores. */
export const IMPLEMENTED_ACTIONS: ReadonlySet<AssetAction> = new Set<AssetAction>([
  'chart',
  'news',
])
