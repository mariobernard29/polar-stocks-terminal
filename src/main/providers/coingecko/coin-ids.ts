/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Símbolo → identificador de CoinGecko
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CoinGecko identifica cada moneda por un `id` (`bitcoin`), no por su símbolo
 * (`BTC`). La traducción no es trivial: hay **miles de tokens que comparten
 * símbolo**. Buscar `BTC` en su API devuelve decenas de resultados, y el
 * primero no siempre es Bitcoin.
 *
 * Estrategia en dos niveles:
 *
 *  1. Un mapa estático con las monedas principales. Resuelve el caso habitual
 *     sin gastar una llamada ni arriesgarse a elegir el token equivocado.
 *  2. Para el resto, `/search`, que sí ordena por capitalización, con el
 *     resultado cacheado en memoria.
 *
 * El mapa estático existe precisamente porque la búsqueda es ambigua: nadie
 * quiere que su watchlist muestre un token con el mismo ticker que Bitcoin.
 */

export const STATIC_COIN_IDS: Readonly<Record<string, string>> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  TRX: 'tron',
  AVAX: 'avalanche-2',
  SHIB: 'shiba-inu',
  DOT: 'polkadot',
  LINK: 'chainlink',
  BCH: 'bitcoin-cash',
  NEAR: 'near',
  MATIC: 'matic-network',
  LTC: 'litecoin',
  ICP: 'internet-computer',
  UNI: 'uniswap',
  DAI: 'dai',
  ETC: 'ethereum-classic',
  APT: 'aptos',
  XLM: 'stellar',
  ATOM: 'cosmos',
  FIL: 'filecoin',
  ARB: 'arbitrum',
  IMX: 'immutable-x',
  HBAR: 'hedera-hashgraph',
  VET: 'vechain',
  OP: 'optimism',
  MKR: 'maker',
  INJ: 'injective-protocol',
  GRT: 'the-graph',
  AAVE: 'aave',
  SUI: 'sui',
  RUNE: 'thorchain',
  PEPE: 'pepe',
  TON: 'the-open-network',
  CRO: 'crypto-com-chain',
  ALGO: 'algorand',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  AXS: 'axie-infinity',
  EOS: 'eos',
  XTZ: 'tezos',
  THETA: 'theta-token',
  RENDER: 'render-token',
  LEO: 'leo-token',
  OKB: 'okb',
}

/** Traducción inversa, para etiquetar respuestas con el símbolo canónico. */
export const SYMBOL_BY_COIN_ID: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(STATIC_COIN_IDS).map(([symbol, id]) => [id, symbol]),
)

/** Resultados de `/search` ya resueltos, para no repetir la llamada. */
const resolvedCache = new Map<string, string>()

export function getStaticCoinId(symbol: string): string | null {
  return STATIC_COIN_IDS[symbol.toUpperCase()] ?? null
}

export function getCachedCoinId(symbol: string): string | null {
  return resolvedCache.get(symbol.toUpperCase()) ?? null
}

export function cacheCoinId(symbol: string, coinId: string): void {
  resolvedCache.set(symbol.toUpperCase(), coinId)
}
