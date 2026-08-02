/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Contexto de Polar AI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Polar AI no puede inventar cifras. Eso no se consigue pidiéndoselo con
 * amabilidad al modelo: se consigue no dándole margen. La estrategia es
 * recopilar los datos **antes** de preguntar y entregárselos en un bloque
 * explícito, con la instrucción de que fuera de ahí no hay nada.
 *
 * Este módulo es la mitad pura de esa estrategia: decidir de qué activos habla
 * la pregunta y convertir los datos recogidos en texto sin ambigüedad. La otra
 * mitad —ir a buscarlos— vive en el proceso principal, que es quien tiene las
 * claves.
 */

/** Cotización tal como se le entrega al modelo. */
export interface ContextQuote {
  readonly symbol: string
  readonly price: number
  readonly change: number
  readonly changePercent: number
  /** `null` si el proveedor no la aporta; no se inventa un USD por defecto. */
  readonly currency: string | null
  readonly previousClose: number | null
  readonly dayHigh: number | null
  readonly dayLow: number | null
  readonly source: string
  /** Epoch ms del dato, no de la petición. */
  readonly at: number
}

export interface ContextProfile {
  readonly symbol: string
  readonly name: string
  readonly exchange: string | null
  readonly industry: string | null
  readonly marketCap: number | null
  readonly source: string
}

export interface ContextNews {
  readonly headline: string
  readonly source: string
  readonly publishedAt: number
  readonly symbols: readonly string[]
}

export interface ContextPosition {
  readonly symbol: string
  readonly quantity: number
  readonly averageCost: number
  readonly costBasis: number
  readonly realizedPnl: number
}

export interface AiContext {
  /** Momento en que se construyó el contexto. Epoch ms. */
  readonly now: number
  /** Estado de la sesión de mercado en Nueva York. */
  readonly marketSession: string
  readonly quotes: readonly ContextQuote[]
  readonly profiles: readonly ContextProfile[]
  readonly news: readonly ContextNews[]
  /** Posiciones de la cartera. `null` si la pregunta no iba de eso. */
  readonly positions: readonly ContextPosition[] | null
  /**
   * Lo que se intentó y no se pudo.
   *
   * Va al modelo a propósito: si falló la cotización de un símbolo, es mejor que
   * lo sepa y lo diga a que se calle o improvise.
   */
  readonly failures: readonly string[]
}

/**
 * Palabras que parecen símbolos y no lo son.
 *
 * Sin esta lista, «¿qué es el PER de AAPL?» iría a buscar cotización de `PER`,
 * gastando una llamada de cuota para no encontrar nada y ensuciar el contexto
 * con un fallo que confundiría al modelo.
 */
const NOT_SYMBOLS = new Set([
  // Jerga financiera que se escribe en mayúsculas.
  'PER', 'PEG', 'ROE', 'ROA', 'ROI', 'BPA', 'EPS', 'EBIT', 'EBITDA', 'FCF',
  'IPO', 'ETF', 'ETC', 'REIT', 'CFD', 'ATH', 'ATL', 'YTD', 'TTM', 'QOQ', 'YOY',
  'PIB', 'IPC', 'FED', 'BCE', 'SEC', 'NYSE', 'AMEX', 'OTC', 'PYME',
  'MACD', 'RSI', 'EMA', 'SMA', 'VWAP', 'ADX', 'ATR', 'BBANDS',
  // Divisas: no son símbolos cotizables por sí solas, hacen falta pares.
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'MXN', 'ARS', 'COP', 'CLP',
  // Palabras corrientes que aparecen en mayúsculas o al empezar una frase.
  'AI', 'IA', 'OK', 'NO', 'SI', 'YES', 'AND', 'OR', 'THE', 'FOR', 'YOU',
  'QUE', 'DEL', 'LOS', 'LAS', 'POR', 'CON', 'UNA', 'SUS', 'MAS', 'ESTA',
  'HOY', 'AYER', 'CUAL', 'COMO', 'QUE', 'ESTE', 'ESE', 'MI', 'TU', 'ES',
  'PDF', 'CSV', 'API', 'URL', 'USA', 'EEUU', 'UE', 'PM', 'AM',
])

/**
 * Extrae de una pregunta los símbolos de los que probablemente habla.
 *
 * Heurística deliberadamente conservadora: es preferible no detectar un símbolo
 * —el usuario puede abrirlo en la aplicación y volver a preguntar— que gastar
 * cuota consultando cinco palabras corrientes en cada mensaje.
 *
 * `explicit` son los símbolos que la aplicación ya sabe que interesan (el activo
 * abierto en ese momento). Van primero porque no son una suposición.
 */
export function extractSymbols(
  question: string,
  explicit: readonly string[] = [],
  limit = 4,
): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  const add = (raw: string): void => {
    const symbol = raw.toUpperCase()
    if (seen.has(symbol) || found.length >= limit) return
    seen.add(symbol)
    found.push(symbol)
  }

  for (const symbol of explicit) add(symbol)

  // Un índice (^GSPC) o un ticker de 1 a 5 letras, opcionalmente con punto o
  // guion (BRK.B, RDS-A). En minúsculas no: «para» o «con» serían candidatos.
  const pattern = /\^?[A-Z]{1,5}(?:[.-][A-Z]{1,3})?/g

  for (const match of question.matchAll(pattern)) {
    const token = match[0]
    // Los índices llevan `^` y nunca son palabras corrientes, así que se
    // aceptan sin pasar por la lista de exclusión.
    if (token.startsWith('^')) {
      add(token)
      continue
    }
    if (token.length < 2) continue
    if (NOT_SYMBOLS.has(token)) continue
    add(token)
  }

  return found
}

/**
 * Límite de palabra que entiende los acentos.
 *
 * `\b` se define sobre `[A-Za-z0-9_]`, así que en «por qué» hay un límite
 * *dentro* de la palabra, entre la `u` y la `é`. Un patrón como `/\bqué\b/`
 * parece correcto y no encuentra nada. Con `\p{L}` y la bandera `u` el límite
 * cae donde corresponde.
 */
const boundary = (body: string): RegExp => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, 'iu')

const PORTFOLIO_PATTERN = boundary(
  'cartera|portafolio|portfolio|mis\\s+posiciones|mi\\s+posición|holdings?',
)

const NEWS_PATTERN = boundary(
  'noticias?|titulares?|news|headlines?|por\\s+qué|porqué|qué\\s+ha\\s+pasado|what\\s+happened',
)

/** Si la pregunta va de la cartera del usuario. */
export function mentionsPortfolio(question: string): boolean {
  return PORTFOLIO_PATTERN.test(question)
}

/** Si la pregunta va de noticias o de por qué se mueve algo. */
export function mentionsNews(question: string): boolean {
  return NEWS_PATTERN.test(question)
}

/** Formatea un número sin locale: el modelo no necesita separadores de miles. */
const num = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 1 ? 6 : 4)

const isoOrNull = (at: number | null): string =>
  at === null ? 'desconocido' : new Date(at).toISOString()

/**
 * Convierte el contexto en el bloque de texto que ve el modelo.
 *
 * Formato plano y etiquetado, no JSON: los modelos siguen mejor una
 * instrucción de «no salgas de aquí» cuando los datos se leen como una ficha
 * que cuando llegan como una estructura que invita a completarla.
 *
 * Cada cifra lleva su fuente y su marca de tiempo. Es lo que permite que la
 * respuesta pueda decir «según Finnhub, hace 12 segundos» en vez de afirmar un
 * precio como si fuera un hecho eterno.
 */
export function serializeContext(context: AiContext): string {
  const lines: string[] = []

  lines.push('=== DATOS ===')
  lines.push(`Momento actual (UTC): ${new Date(context.now).toISOString()}`)
  lines.push(`Sesión del mercado de Nueva York: ${context.marketSession}`)

  if (context.quotes.length > 0) {
    lines.push('')
    lines.push('--- Cotizaciones ---')
    for (const quote of context.quotes) {
      const parts = [
        `precio=${num(quote.price)}${quote.currency ? ` ${quote.currency}` : ' (moneda no informada)'}`,
        `variación=${num(quote.change)} (${num(quote.changePercent)}%)`,
      ]
      if (quote.previousClose !== null) parts.push(`cierre_anterior=${num(quote.previousClose)}`)
      if (quote.dayHigh !== null) parts.push(`máximo_día=${num(quote.dayHigh)}`)
      if (quote.dayLow !== null) parts.push(`mínimo_día=${num(quote.dayLow)}`)

      lines.push(
        `${quote.symbol}: ${parts.join(', ')} [fuente=${quote.source}, dato_de=${isoOrNull(quote.at)}]`,
      )
    }
  }

  if (context.profiles.length > 0) {
    lines.push('')
    lines.push('--- Perfiles ---')
    for (const profile of context.profiles) {
      const parts = [`nombre=${profile.name}`]
      if (profile.exchange) parts.push(`mercado=${profile.exchange}`)
      if (profile.industry) parts.push(`sector=${profile.industry}`)
      if (profile.marketCap !== null) parts.push(`capitalización=${num(profile.marketCap)}`)
      lines.push(`${profile.symbol}: ${parts.join(', ')} [fuente=${profile.source}]`)
    }
  }

  if (context.news.length > 0) {
    lines.push('')
    lines.push('--- Titulares ---')
    for (const item of context.news) {
      const tags = item.symbols.length > 0 ? ` (${item.symbols.join(', ')})` : ''
      lines.push(
        `- ${item.headline}${tags} [${item.source}, ${new Date(item.publishedAt).toISOString()}]`,
      )
    }
  }

  if (context.positions !== null) {
    lines.push('')
    lines.push('--- Cartera del usuario ---')
    if (context.positions.length === 0) {
      lines.push('(sin posiciones registradas)')
    } else {
      for (const position of context.positions) {
        lines.push(
          `${position.symbol}: cantidad=${num(position.quantity)}, ` +
            `coste_medio=${num(position.averageCost)}, ` +
            `coste_total=${num(position.costBasis)}, ` +
            `resultado_realizado=${num(position.realizedPnl)}`,
        )
      }
      lines.push(
        'Nota: el valor de mercado y la plusvalía latente NO están aquí. ' +
          'Calcúlalos solo si hay cotización de ese símbolo más arriba.',
      )
    }
  }

  if (context.failures.length > 0) {
    lines.push('')
    lines.push('--- No disponible ---')
    for (const failure of context.failures) lines.push(`- ${failure}`)
  }

  if (
    context.quotes.length === 0 &&
    context.profiles.length === 0 &&
    context.news.length === 0 &&
    context.positions === null
  ) {
    lines.push('')
    lines.push('(No se recopiló ningún dato de mercado para esta pregunta.)')
  }

  lines.push('=== FIN DE DATOS ===')

  return lines.join('\n')
}

/** Resumen de qué datos se usaron, para enseñárselo al usuario en la interfaz. */
export function describeSources(context: AiContext): string[] {
  const sources: string[] = []

  for (const quote of context.quotes) {
    sources.push(`Cotización de ${quote.symbol} (${quote.source})`)
  }
  for (const profile of context.profiles) {
    sources.push(`Perfil de ${profile.symbol} (${profile.source})`)
  }
  if (context.news.length > 0) {
    sources.push(`${context.news.length} titulares`)
  }
  if (context.positions !== null) {
    sources.push(`Cartera (${context.positions.length} posiciones)`)
  }

  return sources
}
