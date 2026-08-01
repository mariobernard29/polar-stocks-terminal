import { inferAssetClass } from './symbols'

/**
 * Traducción entre el símbolo canónico de la aplicación y el que espera el
 * WebSocket de Finnhub.
 *
 * Es una notación distinta de la de su API REST: allí Bitcoin no existe y en el
 * flujo es `BINANCE:BTCUSDT`. Vive en un módulo propio, sin dependencias, porque
 * es exactamente el tipo de traducción que se rompe en silencio —el socket
 * acepta la suscripción y simplemente no llega nada— y conviene tenerla probada.
 */

/** Prefijo del mercado del que se toman las operaciones de criptomonedas. */
const CRYPTO_EXCHANGE = 'BINANCE'

/** Moneda de cotización de los pares de cripto. */
const CRYPTO_QUOTE = 'USDT'

/**
 * Devuelve el símbolo del flujo, o `null` si ese activo no admite tiempo real.
 *
 * Devolver `null` en vez de intentarlo importa: suscribirse a un índice no da
 * error, simplemente no emite nunca, y la interfaz se quedaría mostrando un
 * indicador «en vivo» junto a un precio que no se mueve jamás.
 */
export function toStreamSymbol(symbol: string): string | null {
  const upper = symbol.toUpperCase()

  switch (inferAssetClass(upper)) {
    case 'crypto':
      return `${CRYPTO_EXCHANGE}:${upper}${CRYPTO_QUOTE}`
    case 'stock':
    case 'etf':
      return upper
    // Los índices no cotizan como tal: no hay operaciones que emitir.
    // Divisas y materias primas requieren plan de pago.
    default:
      return null
  }
}

/** Traducción inversa, para devolver al resto de la app su forma canónica. */
export function fromStreamSymbol(streamSymbol: string): string {
  const crypto = new RegExp(`^${CRYPTO_EXCHANGE}:(.+)${CRYPTO_QUOTE}$`).exec(streamSymbol)
  return crypto?.[1] ?? streamSymbol
}
