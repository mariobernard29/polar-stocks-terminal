import { describe, expect, it } from 'vitest'
import { fromStreamSymbol, toStreamSymbol } from './stream-symbols'

/**
 * Esta traducción falla en silencio: el WebSocket acepta cualquier suscripción
 * sin quejarse y, si el símbolo no es el que espera, simplemente no llega nada.
 * No hay error que ver en el log, solo un precio que no se mueve.
 */
describe('toStreamSymbol', () => {
  it('convierte las criptomonedas al par de Binance', () => {
    expect(toStreamSymbol('BTC')).toBe('BINANCE:BTCUSDT')
    expect(toStreamSymbol('ETH')).toBe('BINANCE:ETHUSDT')
    expect(toStreamSymbol('SOL')).toBe('BINANCE:SOLUSDT')
  })

  it('deja las acciones y ETFs tal cual', () => {
    expect(toStreamSymbol('AAPL')).toBe('AAPL')
    expect(toStreamSymbol('SPY')).toBe('SPY')
  })

  it('normaliza a mayúsculas', () => {
    expect(toStreamSymbol('aapl')).toBe('AAPL')
    expect(toStreamSymbol('btc')).toBe('BINANCE:BTCUSDT')
  })

  /**
   * Suscribirse a un índice no da error: no emite nunca. Sin este `null`, la
   * interfaz mostraría un indicador «en vivo» junto a un precio congelado.
   */
  it('rechaza lo que no puede emitir operaciones', () => {
    expect(toStreamSymbol('^GSPC')).toBeNull()
    expect(toStreamSymbol('^IXIC')).toBeNull()
    expect(toStreamSymbol('EURUSD')).toBeNull()
    expect(toStreamSymbol('XAUUSD')).toBeNull()
  })
})

describe('fromStreamSymbol', () => {
  it('recupera la forma canónica de una cripto', () => {
    expect(fromStreamSymbol('BINANCE:BTCUSDT')).toBe('BTC')
    expect(fromStreamSymbol('BINANCE:ETHUSDT')).toBe('ETH')
  })

  it('deja intacto lo que ya es canónico', () => {
    expect(fromStreamSymbol('AAPL')).toBe('AAPL')
  })

  it('es la inversa exacta de toStreamSymbol', () => {
    for (const symbol of ['BTC', 'ETH', 'SOL', 'DOGE', 'AAPL', 'MSFT', 'SPY']) {
      const stream = toStreamSymbol(symbol)
      expect(stream, symbol).not.toBeNull()
      expect(fromStreamSymbol(stream ?? ''), symbol).toBe(symbol)
    }
  })
})
