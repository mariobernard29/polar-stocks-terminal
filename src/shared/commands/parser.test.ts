import { describe, expect, it } from 'vitest'
import { parseCommand } from './parser'

/**
 * El buscador es la vía principal de uso de la terminal. Su comportamiento debe
 * estar fijado por pruebas y no depender de cómo se sienta la interfaz un día
 * concreto.
 */

describe('parseCommand — símbolo solo', () => {
  it.each(['AAPL', 'MSFT', 'TSLA', 'BTC', 'SPY', 'QQQ', 'NVDA'])(
    'reconoce %s como símbolo y acción por defecto',
    (input) => {
      const result = parseCommand(input)
      expect(result.symbol).toBe(input)
      expect(result.action).toBe('overview')
      expect(result.hasExplicitAction).toBe(false)
    },
  )

  it('normaliza el símbolo a mayúsculas', () => {
    expect(parseCommand('aapl').symbol).toBe('AAPL')
    expect(parseCommand('  nvda  ').symbol).toBe('NVDA')
  })

  it('acepta las formas de símbolo poco habituales', () => {
    expect(parseCommand('^GSPC').symbol).toBe('^GSPC')
    expect(parseCommand('BRK.B').symbol).toBe('BRK.B')
    expect(parseCommand('EURUSD').symbol).toBe('EURUSD')
    expect(parseCommand('RDS-A').symbol).toBe('RDS-A')
  })
})

describe('parseCommand — símbolo con verbo', () => {
  it.each([
    ['AAPL chart', 'AAPL', 'chart'],
    ['AAPL news', 'AAPL', 'news'],
    ['AAPL financials', 'AAPL', 'financials'],
    ['AAPL earnings', 'AAPL', 'earnings'],
    ['BTC metrics', 'BTC', 'metrics'],
  ])('entiende «%s» en inglés', (input, symbol, action) => {
    const result = parseCommand(input)
    expect(result.symbol).toBe(symbol)
    expect(result.action).toBe(action)
    expect(result.hasExplicitAction).toBe(true)
    expect(result.freeText).toBe('')
  })

  it.each([
    ['AAPL grafico', 'chart'],
    ['AAPL gráfico', 'chart'],
    ['BTC noticias', 'news'],
    ['NVDA fundamentales', 'financials'],
    ['NVDA financieros', 'financials'],
    ['TSLA resultados', 'earnings'],
    ['ETH metricas', 'metrics'],
    ['ETH métricas', 'metrics'],
  ])('entiende «%s» en español, con y sin tildes', (input, action) => {
    expect(parseCommand(input).action).toBe(action)
    expect(parseCommand(input).hasExplicitAction).toBe(true)
  })

  it('acepta abreviaturas de una letra, que es como se usa a diario', () => {
    expect(parseCommand('AAPL g').action).toBe('chart')
    expect(parseCommand('AAPL n').action).toBe('news')
    expect(parseCommand('AAPL f').action).toBe('financials')
  })

  it('ignora mayúsculas y minúsculas en el verbo', () => {
    expect(parseCommand('AAPL CHART').action).toBe('chart')
    expect(parseCommand('AAPL Noticias').action).toBe('news')
  })

  it('tolera espacios de más', () => {
    const result = parseCommand('   AAPL    chart   ')
    expect(result.symbol).toBe('AAPL')
    expect(result.action).toBe('chart')
  })
})

describe('parseCommand — búsqueda libre', () => {
  /**
   * `banco` tiene exactamente la misma forma que `AAPL`: cinco letras. Ninguna
   * expresión regular puede distinguir un ticker de una palabra corriente.
   *
   * La decisión de diseño es que el parser **no adivine**: mantiene el candidato
   * y a la vez devuelve el texto completo como búsqueda libre. Quien descarta el
   * candidato es el buscador, comprobando si ese símbolo existe de verdad — un
   * dato, no una heurística.
   */
  it('mantiene el candidato y la búsqueda libre cuando son indistinguibles', () => {
    const result = parseCommand('banco santander')
    expect(result.symbol).toBe('BANCO')
    expect(result.hasExplicitAction).toBe(false)
    expect(result.freeText).toBe('banco santander')
  })

  it('conserva el símbolo candidato si el segundo token no es un verbo', () => {
    // "apple" podría ser parte del nombre; no se inventa una acción.
    const result = parseCommand('AAPL apple inc')
    expect(result.symbol).toBe('AAPL')
    expect(result.action).toBe('overview')
    expect(result.hasExplicitAction).toBe(false)
    expect(result.freeText).toBe('AAPL apple inc')
  })

  it('no adivina cuando hay texto de sobra tras un verbo válido', () => {
    const result = parseCommand('AAPL chart cosa rara')
    expect(result.hasExplicitAction).toBe(false)
    expect(result.action).toBe('overview')
    expect(result.freeText).toBe('AAPL chart cosa rara')
  })

  it('devuelve vacío con entrada vacía o solo espacios', () => {
    for (const input of ['', '   ', '\t\n']) {
      const result = parseCommand(input)
      expect(result.symbol).toBeNull()
      expect(result.freeText).toBe('')
    }
  })

  it('no confunde un número suelto con un símbolo', () => {
    expect(parseCommand('500').symbol).toBeNull()
  })
})
