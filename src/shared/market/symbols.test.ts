import { describe, expect, it } from 'vitest'
import { inferAssetClass, isCanonicalSymbol, isEquityLike } from './symbols'

/**
 * Regresión de un fallo de datos real: `BTC` es el ticker de una empresa
 * cotizada en Finnhub. La aplicación pedía la cotización de `BTC` a un proveedor
 * de renta variable y mostraba 27,81 US$ como si fuera el precio de un bitcoin.
 *
 * Un dato equivocado con aspecto de correcto es peor que un hueco.
 */
describe('inferAssetClass', () => {
  it('reconoce las criptomonedas por su símbolo', () => {
    for (const symbol of ['BTC', 'ETH', 'SOL', 'DOGE', 'SHIB', 'XRP', 'ADA']) {
      expect(inferAssetClass(symbol), symbol).toBe('crypto')
    }
  })

  it('reconoce los índices por el prefijo ^', () => {
    expect(inferAssetClass('^GSPC')).toBe('index')
    expect(inferAssetClass('^IXIC')).toBe('index')
    expect(inferAssetClass('^IBEX')).toBe('index')
  })

  it('reconoce los pares de divisas', () => {
    expect(inferAssetClass('EURUSD')).toBe('forex')
    expect(inferAssetClass('USDJPY')).toBe('forex')
    expect(inferAssetClass('GBPUSD')).toBe('forex')
  })

  it('distingue el oro de un par de divisas pese a su forma', () => {
    // XAUUSD tiene seis letras como EURUSD, pero XAU no es una divisa.
    expect(inferAssetClass('XAUUSD')).toBe('commodity')
    expect(inferAssetClass('XAGUSD')).toBe('commodity')
    expect(inferAssetClass('WTI')).toBe('commodity')
  })

  it('trata como acción lo que no encaja en otra categoría', () => {
    for (const symbol of ['AAPL', 'MSFT', 'NVDA', 'SAN', 'ITX', 'BRK.B']) {
      expect(inferAssetClass(symbol), symbol).toBe('stock')
    }
  })

  it('no distingue mayúsculas', () => {
    expect(inferAssetClass('btc')).toBe('crypto')
    expect(inferAssetClass('eurusd')).toBe('forex')
  })

  it('no confunde una acción de seis letras con un par de divisas', () => {
    // GOOGLE no son dos códigos ISO válidos.
    expect(inferAssetClass('GOOGLE')).toBe('stock')
  })
})

describe('isEquityLike', () => {
  it('acepta lo que un proveedor de renta variable puede servir', () => {
    expect(isEquityLike('AAPL')).toBe(true)
    expect(isEquityLike('SPY')).toBe(true)
    expect(isEquityLike('^GSPC')).toBe(true)
  })

  it('rechaza lo que ese proveedor confundiría con otra cosa', () => {
    expect(isEquityLike('BTC')).toBe(false)
    expect(isEquityLike('ETH')).toBe(false)
    expect(isEquityLike('EURUSD')).toBe(false)
    expect(isEquityLike('XAUUSD')).toBe(false)
  })
})

/**
 * Regresión: el calendario de resultados de Finnhub incluye acciones
 * preferentes con espacios («ICR PR A»). Dos símbolos así, de mil quinientos
 * eventos, rompían la validación del contrato y dejaban el calendario
 * completamente vacío.
 */
describe('isCanonicalSymbol', () => {
  it('acepta las formas que usa la aplicación', () => {
    for (const symbol of ['AAPL', 'BRK.B', '^GSPC', 'EURUSD', 'RDS-A', 'BTC']) {
      expect(isCanonicalSymbol(symbol), symbol).toBe(true)
    }
  })

  it('rechaza las preferentes con espacios que cuelan los proveedores', () => {
    expect(isCanonicalSymbol('ICR PR A')).toBe(false)
    expect(isCanonicalSymbol('CTA PR A')).toBe(false)
  })

  it('rechaza cadenas vacías y símbolos con caracteres imposibles', () => {
    expect(isCanonicalSymbol('')).toBe(false)
    expect(isCanonicalSymbol('AA PL')).toBe(false)
    expect(isCanonicalSymbol('AAPL/USD')).toBe(false)
  })
})
