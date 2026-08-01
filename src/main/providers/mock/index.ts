import type { Candle, CandleSeries, Instrument, NewsItem, Quote } from '@shared/domain'
import { getMarketState } from '@shared/market/session'
import { AppError } from '../../ipc/app-error'
import type { MarketDataProvider } from '../types'
import { CATALOG, type CatalogEntry } from './catalog'
import { hashString, seededRandom } from './random'

/**
 * Proveedor de datos simulados.
 *
 * Existe para que toda la aplicación —paneles, buscador, watchlists, caché,
 * failover— se pueda construir y probar antes de conectar ninguna API real, sin
 * gastar cuota y sin acoplarse al formato de nadie. En la Fase 2 se le añaden
 * proveedores reales al lado; este se queda, porque es lo que permite probar la
 * interfaz de forma reproducible y trabajar sin conexión.
 *
 * Los datos son **deterministas**: derivan de un hash del símbolo, así que AAPL
 * tiene siempre la misma capitalización y el mismo perfil entre reinicios. Lo
 * único que cambia con el tiempo es el precio, y lo hace con una caminata
 * suave, no a saltos aleatorios: un gráfico de ruido puro se nota falso a
 * simple vista.
 */

const MINUTE = 60_000

function timeframeToMs(timeframe: string): number {
  switch (timeframe) {
    case '1m':
      return MINUTE
    case '5m':
      return 5 * MINUTE
    case '15m':
      return 15 * MINUTE
    case '30m':
      return 30 * MINUTE
    case '1h':
      return 60 * MINUTE
    case '4h':
      return 240 * MINUTE
    case '1D':
      return 24 * 60 * MINUTE
    case '1W':
      return 7 * 24 * 60 * MINUTE
    case '1M':
      return 30 * 24 * 60 * MINUTE
    default:
      return 24 * 60 * MINUTE
  }
}

function findEntry(symbol: string): CatalogEntry {
  const entry = CATALOG.find((item) => item.symbol === symbol.toUpperCase())
  if (!entry) {
    throw new AppError('NOT_FOUND', `El símbolo ${symbol} no existe en el catálogo simulado.`)
  }
  return entry
}

/**
 * Octavas del precio: periodos largos con mucha amplitud, cortos con poca.
 *
 * El reparto de amplitudes imita el de una serie de precios real (la varianza
 * crece con el horizonte temporal), pero lo determinante es la **cobertura de
 * escalas**. Con solo ondas rápidas —periodos de 89 a 2011 minutos—, una vela
 * diaria muestrea cada 1440 minutos, muy por encima del límite de Nyquist de
 * esas ondas: cada vela caía en una fase esencialmente aleatoria de la anterior
 * y el gráfico diario salía como ruido blanco, sin tendencia visible.
 *
 * Con octavas de hasta ~91 días, el gráfico diario muestra tendencia y el
 * intradía sigue teniendo textura. Los periodos evitan potencias de dos y
 * múltiplos entre sí para que las ondas no entren en resonancia.
 */
const PRICE_OCTAVES: readonly { periodMinutes: number; amplitude: number }[] = [
  { periodMinutes: 131_071, amplitude: 0.11 }, // ~91 días
  { periodMinutes: 32_749, amplitude: 0.06 }, // ~23 días
  { periodMinutes: 8191, amplitude: 0.035 }, // ~5,7 días
  { periodMinutes: 2053, amplitude: 0.018 }, // ~1,4 días
  { periodMinutes: 509, amplitude: 0.009 }, // ~8,5 horas
  { periodMinutes: 127, amplitude: 0.004 }, // ~2 horas
]

/**
 * Decimales significativos según la clase de activo y la magnitud.
 *
 * No es un detalle de formato: redondear a dos decimales un par de divisas que
 * cotiza a 1,0842 lo deja en 1,08, y entonces el precio de hace 24 horas
 * coincide exactamente con el actual — EURUSD aparecía plano al 0,00 %. El
 * mercado de divisas se mueve en la cuarta cifra decimal.
 */
function decimalsForAsset(entry: CatalogEntry): number {
  if (entry.assetClass === 'forex') return 5
  const magnitude = entry.basePrice
  if (magnitude < 0.01) return 8
  if (magnitude < 1) return 6
  if (magnitude < 10) return 4
  return 2
}

/**
 * Precio simulado en un instante.
 *
 * Caminata determinista: el precio depende del símbolo y del bloque de tiempo,
 * de modo que dos llamadas seguidas dan casi lo mismo y una hora después ha
 * derivado. Reproducible y creíble a la vez.
 */
function priceAt(entry: CatalogEntry, timestamp: number): number {
  const bucket = Math.floor(timestamp / MINUTE)
  // El hash da 0–1; se escala a una vuelta completa. Usándolo tal cual, todos
  // los símbolos quedaban dentro de 1 radián y subían y bajaban a la vez, con
  // lo que el mercado simulado nunca mostraba caídas.
  const seed = hashString(entry.symbol) * Math.PI * 2

  let value = entry.basePrice
  for (const [index, octave] of PRICE_OCTAVES.entries()) {
    value *= 1 + octave.amplitude * Math.sin((bucket / octave.periodMinutes) * Math.PI * 2 + seed * (1 + index * 0.37))
  }

  return Number(value.toFixed(decimalsForAsset(entry)))
}

function buildQuote(entry: CatalogEntry, now: number): Quote {
  const price = priceAt(entry, now)
  const previousClose = priceAt(entry, now - 24 * 60 * MINUTE)
  const change = price - previousClose
  const random = seededRandom(hashString(entry.symbol) + Math.floor(now / (24 * 60 * MINUTE)))

  const dayHigh = Number((price * (1 + random() * 0.012)).toFixed(2))
  const dayLow = Number((price * (1 - random() * 0.012)).toFixed(2))
  const state = getMarketState(new Date(now), entry.assetClass)

  return {
    symbol: entry.symbol,
    price,
    change: Number(change.toFixed(4)),
    changePercent: Number(((change / previousClose) * 100).toFixed(2)),
    previousClose: Number(previousClose.toFixed(2)),
    open: Number((previousClose * (1 + (random() - 0.5) * 0.006)).toFixed(2)),
    dayHigh,
    dayLow,
    volume: Math.floor(entry.baseVolume * (0.6 + random() * 0.8)),
    marketState: state,
    // Solo hay precio extendido cuando la sesión regular no está abierta: si no,
    // el dato no existe, y devolver un número sería inventarlo.
    extendedPrice: state === 'pre' || state === 'after' ? Number((price * 1.001).toFixed(2)) : null,
    extendedChangePercent: state === 'pre' || state === 'after' ? 0.1 : null,
    currency: entry.currency,
    timestamp: now,
    source: MOCK_PROVIDER_ID,
  }
}

function buildCandles(entry: CatalogEntry, timeframe: string, limit: number, now: number): Candle[] {
  const step = timeframeToMs(timeframe)
  const candles: Candle[] = []

  for (let index = limit - 1; index >= 0; index -= 1) {
    const time = now - index * step
    const open = priceAt(entry, time - step)
    const close = priceAt(entry, time)
    const random = seededRandom(hashString(entry.symbol) + Math.floor(time / step))
    const spread = Math.max(Math.abs(close - open), close * 0.002)

    candles.push({
      time,
      open,
      high: Number((Math.max(open, close) + spread * random()).toFixed(2)),
      low: Number((Math.min(open, close) - spread * random()).toFixed(2)),
      close,
      volume: Math.floor(entry.baseVolume * (0.4 + random())),
    })
  }

  return candles
}

const HEADLINES = [
  'presenta resultados por encima de lo esperado',
  'anuncia una recompra de acciones',
  'los analistas revisan al alza su precio objetivo',
  'amplía su presencia en mercados emergentes',
  'firma un acuerdo estratégico de suministro',
  'reorganiza su cúpula directiva',
]

function buildNews(entry: CatalogEntry | null, limit: number, now: number): NewsItem[] {
  const items: NewsItem[] = []
  const base = entry?.symbol ?? 'MERCADO'

  for (let index = 0; index < limit; index += 1) {
    const random = seededRandom(hashString(base + index))
    const headlineIndex = Math.floor(random() * HEADLINES.length)
    const name = entry?.name ?? 'El mercado'

    items.push({
      id: `mock-${base}-${index}`,
      headline: `${name} ${HEADLINES[headlineIndex] ?? HEADLINES[0]}`,
      summary:
        'Noticia simulada generada por el proveedor de pruebas. No refleja información real ' +
        'de ningún mercado ni debe usarse para tomar decisiones.',
      url: `https://example.com/noticias/${base.toLowerCase()}/${index}`,
      source: 'Polar Mock Newswire',
      publishedAt: now - index * 37 * MINUTE,
      symbols: entry ? [entry.symbol] : [],
      category: entry?.assetClass === 'crypto' ? 'crypto' : entry ? 'company' : 'market',
      imageUrl: null,
      provider: MOCK_PROVIDER_ID,
    })
  }

  return items
}

export const MOCK_PROVIDER_ID = 'mock'

export const mockProvider: MarketDataProvider = {
  id: MOCK_PROVIDER_ID,
  displayName: 'Datos simulados',
  requiresApiKey: false,
  // Límite generoso pero real: así el camino de la cuota se ejercita en
  // desarrollo en vez de descubrirse el día que se conecta un proveedor real.
  rateLimit: { capacity: 120, refillPerSecond: 20 },
  docsUrl: null,

  // Solo atiende cuando ningún proveedor real puede. Ver  en
  // : es lo que impide que datos simulados sustituyan a
  // datos de mercado por una prioridad mal configurada.
  isFallback: true,

  methods: {
    quote: async ({ symbol }) => buildQuote(findEntry(symbol), Date.now()),

    cryptoQuote: async ({ symbol }) => {
      const entry = findEntry(symbol)
      if (entry.assetClass !== 'crypto') {
        throw new AppError('NOT_FOUND', `${symbol} no es una criptomoneda.`)
      }
      return buildQuote(entry, Date.now())
    },

    search: async ({ text, limit }) => {
      const needle = text.trim().toUpperCase()
      const matches = CATALOG.filter(
        (entry) =>
          entry.symbol.includes(needle) || entry.name.toUpperCase().includes(needle),
      )
        // Coincidencia exacta de símbolo primero: quien escribe "AAPL" quiere Apple.
        .sort((a, b) => {
          if (a.symbol === needle) return -1
          if (b.symbol === needle) return 1
          return a.symbol.localeCompare(b.symbol)
        })
        .slice(0, limit)

      return matches.map(
        (entry): Instrument => ({
          symbol: entry.symbol,
          name: entry.name,
          assetClass: entry.assetClass,
          exchange: entry.exchange,
          currency: entry.currency,
        }),
      )
    },

    news: async ({ symbol, limit }) =>
      buildNews(symbol ? findEntry(symbol) : null, limit, Date.now()),

    historical: async ({ symbol, timeframe, limit }): Promise<CandleSeries> => ({
      symbol: symbol.toUpperCase(),
      timeframe,
      candles: buildCandles(findEntry(symbol), timeframe, limit, Date.now()),
      source: MOCK_PROVIDER_ID,
    }),
  },
}
