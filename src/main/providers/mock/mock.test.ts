import { describe, expect, it } from 'vitest'
import { capabilitiesOf } from '../types'
import { mockProvider } from './index'

const methods = mockProvider.methods

describe('proveedor simulado', () => {
  it('declara exactamente las capacidades que implementa', () => {
    const capabilities = capabilitiesOf(mockProvider)
    expect([...capabilities].sort()).toEqual([
      'cryptoQuote',
      'historical',
      'news',
      'quote',
      'search',
    ])
  })

  it('es determinista: dos llamadas seguidas dan el mismo precio', async () => {
    const first = await methods.quote?.({ symbol: 'AAPL' })
    const second = await methods.quote?.({ symbol: 'AAPL' })
    expect(first?.price).toBe(second?.price)
  })

  it('no aplasta a cero los precios muy pequeños de las criptomonedas', async () => {
    const quote = await methods.quote?.({ symbol: 'SHIB' })
    expect(quote?.price).toBeGreaterThan(0)
    // SHIB vale ~0,000021: con redondeo a 2 decimales quedaría en 0.
    expect(quote?.price).toBeLessThan(0.001)
  })

  /**
   * Regresión: con periodos de onda que dividían exactamente un día, el precio
   * de hace 24 h coincidía siempre con el actual y TODA la aplicación mostraba
   * +0,00 %. Un mercado simulado en el que nada se mueve no sirve para nada.
   */
  it('produce variaciones diarias distintas de cero', async () => {
    const symbols = ['AAPL', 'MSFT', 'BTC', 'SPY', 'EURUSD', '^GSPC']
    const changes = await Promise.all(
      symbols.map(async (symbol) => (await methods.quote?.({ symbol }))?.changePercent ?? 0),
    )

    for (const [index, change] of changes.entries()) {
      expect(change, `${symbols[index]} no se mueve`).not.toBe(0)
    }

    // Y no todos igual: si lo fueran, el movimiento no dependería del símbolo.
    expect(new Set(changes).size).toBeGreaterThan(1)
  })

  /**
   * Regresión: usando el hash (0–1) como fase en radianes, todos los símbolos
   * quedaban casi en fase y subían o bajaban a la vez. Un mercado donde todo
   * está en verde no ejercita jamás el renderizado de pérdidas.
   */
  it('mueve los símbolos de forma descorrelacionada: hay subidas y bajadas a la vez', async () => {
    const symbols = [
      'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM',
      'SPY', 'QQQ', 'BTC', 'ETH', 'SOL', 'DOGE', 'EURUSD', 'XAUUSD',
    ]
    const changes = await Promise.all(
      symbols.map(async (symbol) => (await methods.quote?.({ symbol }))?.changePercent ?? 0),
    )

    expect(changes.some((c) => c > 0), 'ninguno sube').toBe(true)
    expect(changes.some((c) => c < 0), 'ninguno baja').toBe(true)
  })

  it('mantiene las variaciones en un rango plausible', async () => {
    for (const symbol of ['AAPL', 'BTC', 'SPY']) {
      const quote = await methods.quote?.({ symbol })
      expect(Math.abs(quote?.changePercent ?? 0)).toBeLessThan(25)
    }
  })

  it('pone el símbolo exacto primero en la búsqueda', async () => {
    const results = await methods.search?.({ text: 'AAPL', limit: 10 })
    expect(results?.[0]?.symbol).toBe('AAPL')
  })

  it('busca también por nombre, no solo por símbolo', async () => {
    const results = await methods.search?.({ text: 'bitcoin', limit: 10 })
    expect(results?.some((r) => r.symbol === 'BTC')).toBe(true)
  })

  it('respeta el límite de resultados', async () => {
    const results = await methods.search?.({ text: 'A', limit: 3 })
    expect(results?.length).toBeLessThanOrEqual(3)
  })

  it('rechaza un símbolo desconocido con NOT_FOUND', async () => {
    await expect(methods.quote?.({ symbol: 'NOEXISTE' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('cryptoQuote rechaza lo que no es cripto', async () => {
    await expect(methods.cryptoQuote?.({ symbol: 'AAPL' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(methods.cryptoQuote?.({ symbol: 'BTC' })).resolves.toBeDefined()
  })

  it('genera velas coherentes: high ≥ max(open,close) y low ≤ min(open,close)', async () => {
    const series = await methods.historical?.({ symbol: 'MSFT', timeframe: '1D', limit: 60 })

    expect(series?.candles).toHaveLength(60)
    for (const candle of series?.candles ?? []) {
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close))
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close))
    }
  })

  /**
   * Regresión de aliasing: con solo ondas de periodo corto (89–2011 minutos),
   * una vela diaria muestreaba muy por encima del límite de Nyquist y el
   * gráfico salía como ruido blanco — cada vela sin relación con la anterior.
   *
   * Una serie de precios real es continua: el salto medio entre cierres
   * consecutivos es mucho menor que el recorrido total del periodo. Eso es lo
   * que se comprueba aquí, y es lo que distingue una tendencia del ruido.
   */
  it('genera series diarias continuas, no ruido blanco', async () => {
    const series = await methods.historical?.({ symbol: 'AAPL', timeframe: '1D', limit: 120 })
    const closes = series?.candles.map((c) => c.close) ?? []

    const steps = closes.slice(1).map((close, i) => Math.abs(close - (closes[i] ?? 0)))
    const meanStep = steps.reduce((a, b) => a + b, 0) / steps.length
    const range = Math.max(...closes) - Math.min(...closes)

    // En ruido blanco el salto medio se acerca al recorrido total. En una serie
    // con tendencia es una fracción pequeña.
    expect(meanStep / range).toBeLessThan(0.15)
  })

  it('mantiene continuidad también en escala intradía', async () => {
    const series = await methods.historical?.({ symbol: 'BTC', timeframe: '1h', limit: 120 })
    const closes = series?.candles.map((c) => c.close) ?? []

    const steps = closes.slice(1).map((close, i) => Math.abs(close - (closes[i] ?? 0)))
    const meanStep = steps.reduce((a, b) => a + b, 0) / steps.length
    const range = Math.max(...closes) - Math.min(...closes)

    expect(meanStep / range).toBeLessThan(0.15)
  })

  it('devuelve las velas en orden cronológico ascendente', async () => {
    const series = await methods.historical?.({ symbol: 'SPY', timeframe: '1h', limit: 24 })
    const times = series?.candles.map((c) => c.time) ?? []
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('cripto y forex nunca aparecen como mercado cerrado', async () => {
    const btc = await methods.quote?.({ symbol: 'BTC' })
    const eur = await methods.quote?.({ symbol: 'EURUSD' })
    expect(btc?.marketState).toBe('open')
    expect(eur?.marketState).toBe('open')
  })

  it('devuelve noticias generales cuando no se indica símbolo', async () => {
    const items = await methods.news?.({ symbol: null, category: null, limit: 5 })
    expect(items).toHaveLength(5)
    expect(items?.[0]?.symbols).toEqual([])
  })

  it('etiqueta como cripto las noticias de un activo cripto', async () => {
    const items = await methods.news?.({ symbol: 'BTC', category: null, limit: 2 })
    expect(items?.[0]?.category).toBe('crypto')
    expect(items?.[0]?.symbols).toEqual(['BTC'])
  })
})
