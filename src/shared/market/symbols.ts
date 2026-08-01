import type { AssetClass } from '../domain'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Clasificación de símbolos canónicos
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Existe por un fallo concreto y grave: en Finnhub, `BTC` es el ticker de una
 * empresa cotizada, no de Bitcoin. Pedirle la cotización de `BTC` devuelve 200
 * con el precio de esa acción, y la aplicación lo mostraba como si fuera
 * Bitcoin — 27,81 US$ presentados como el precio de un bitcoin.
 *
 * Un dato equivocado con aspecto de correcto es peor que un hueco. Así que antes
 * de preguntar a un proveedor hay que saber **qué clase de activo** es el
 * símbolo, y cada proveedor declina lo que no sabe servir.
 *
 * Esta clasificación es una heurística sobre la forma canónica de la propia
 * aplicación, no sobre la notación de ningún proveedor. Cuando el usuario añade
 * un activo desde el buscador, su clase viene del proveedor y se guarda; esta
 * función cubre los casos en que solo se tiene el símbolo.
 */

/**
 * Criptomonedas por capitalización. No pretende ser exhaustiva: cubre lo que
 * un usuario escribe a mano en el buscador o mete en una watchlist.
 */
const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'USDC', 'XRP', 'DOGE', 'ADA', 'TRX',
  'AVAX', 'SHIB', 'DOT', 'LINK', 'BCH', 'NEAR', 'MATIC', 'LTC', 'ICP', 'UNI',
  'LEO', 'DAI', 'ETC', 'APT', 'XLM', 'RENDER', 'ATOM', 'OKB', 'FIL', 'ARB',
  'IMX', 'HBAR', 'VET', 'OP', 'MKR', 'INJ', 'GRT', 'AAVE', 'SUI', 'RUNE',
  'PEPE', 'TON', 'CRO', 'ALGO', 'SAND', 'MANA', 'AXS', 'EOS', 'XTZ', 'THETA',
])

/** Metales y materias primas con notación de par. */
const COMMODITY_SYMBOLS = new Set([
  'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', 'WTI', 'BRENT', 'NATGAS', 'COPPER',
])

/** Divisas ISO 4217 que forman los pares habituales. */
const CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'CNY', 'HKD',
  'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'ZAR', 'SGD', 'TRY', 'PLN', 'INR',
])

/**
 * Deduce la clase de activo a partir del símbolo canónico.
 *
 * El orden importa: las materias primas se comprueban antes que el forex porque
 * `XAUUSD` tiene forma de par de divisas pero es oro.
 */
export function inferAssetClass(symbol: string): AssetClass {
  const upper = symbol.toUpperCase()

  // Los índices llevan `^` por convención de la aplicación.
  if (upper.startsWith('^')) return 'index'

  if (COMMODITY_SYMBOLS.has(upper)) return 'commodity'
  if (CRYPTO_SYMBOLS.has(upper)) return 'crypto'

  // Par de divisas: seis letras que son dos códigos ISO conocidos.
  if (upper.length === 6) {
    const base = upper.slice(0, 3)
    const quote = upper.slice(3)
    if (CURRENCIES.has(base) && CURRENCIES.has(quote)) return 'forex'
  }

  // Por defecto, acción. Los ETFs no se distinguen por la forma del símbolo:
  // esa información llega del proveedor y se guarda con el activo.
  return 'stock'
}

/**
 * Clases que un proveedor de renta variable puede servir con su endpoint de
 * cotización normal.
 *
 * Se usa para que un adaptador de acciones **decline** una cripto en lugar de
 * devolver el ticker homónimo de otra empresa.
 */
export const EQUITY_LIKE_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'stock',
  'etf',
  'index',
])

export function isEquityLike(symbol: string): boolean {
  return EQUITY_LIKE_CLASSES.has(inferAssetClass(symbol))
}

/**
 * Forma canónica válida para un símbolo de la aplicación.
 *
 * Debe coincidir con `symbolSchema` del dominio; se duplica aquí para poder
 * filtrar en los adaptadores sin arrastrar zod hasta ellos.
 *
 * Hace falta porque algunos proveedores mezclan notaciones ajenas en sus
 * respuestas: el calendario de resultados de Finnhub incluye acciones
 * preferentes como `ICR PR A`, con espacios. Son instrumentos legítimos, pero ni
 * encajan en nuestra forma canónica ni se pueden cotizar con su endpoint
 * normal, así que una fila de calendario para ellas no llevaría a ninguna
 * parte. Descartarlas en el adaptador es preferible a dejar que rompan la
 * validación del contrato y tumben la respuesta entera — que es exactamente lo
 * que pasó: dos símbolos de mil quinientos dejaban el calendario vacío.
 */
const CANONICAL_SYMBOL = /^\^?[A-Za-z][A-Za-z0-9.\-:]{0,31}$/

export function isCanonicalSymbol(symbol: string): boolean {
  return CANONICAL_SYMBOL.test(symbol)
}
