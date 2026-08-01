import type { Quote } from '@shared/domain'
import { describe, expect, it, vi } from 'vitest'
import { ProviderRegistry } from './registry'
import type { MarketDataProvider } from './types'

/**
 * El registro es lo que hace que la aplicación siga funcionando cuando un
 * proveedor se cae, se queda sin cuota o el usuario no lo ha configurado. Es
 * lógica pura y merece pruebas exhaustivas: aquí se decide si el usuario ve
 * datos o ve un error.
 */

function quoteOf(symbol: string, price: number, source: string): Quote {
  return {
    symbol,
    price,
    change: 0,
    changePercent: 0,
    previousClose: price,
    open: price,
    dayHigh: price,
    dayLow: price,
    volume: 0,
    marketState: 'open',
    extendedPrice: null,
    extendedChangePercent: null,
    currency: 'USD',
    timestamp: 1,
    source,
  }
}

function makeProvider(
  id: string,
  overrides: Partial<MarketDataProvider> = {},
): MarketDataProvider {
  return {
    id,
    displayName: id,
    requiresApiKey: false,
    rateLimit: { capacity: 100, refillPerSecond: 100 },
    docsUrl: null,
    methods: { quote: async ({ symbol }) => quoteOf(symbol, 100, id) },
    ...overrides,
  }
}

const OK = { enabled: true, priority: 10, hasCredential: true }

describe('ProviderRegistry — resolución y failover', () => {
  it('usa el proveedor de menor prioridad numérica', async () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('lento'), { ...OK, priority: 50 })
    registry.register(makeProvider('rapido'), { ...OK, priority: 1 })

    const quote = await registry.execute('quote', { symbol: 'AAPL' })
    expect(quote.source).toBe('rapido')
  })

  it('cae al siguiente proveedor cuando el preferente falla', async () => {
    const roto = makeProvider('roto', {
      methods: {
        quote: async () => {
          throw new Error('502 del proveedor')
        },
      },
    })

    const registry = new ProviderRegistry()
    registry.register(roto, { ...OK, priority: 1 })
    registry.register(makeProvider('suplente'), { ...OK, priority: 2 })

    const quote = await registry.execute('quote', { symbol: 'AAPL' })
    expect(quote.source).toBe('suplente')
  })

  it('propaga un error reintentable si fallan todos', async () => {
    const roto = makeProvider('roto', {
      methods: {
        quote: async () => {
          throw new Error('caído')
        },
      },
    })

    const registry = new ProviderRegistry()
    registry.register(roto, OK)

    await expect(registry.execute('quote', { symbol: 'AAPL' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    })
  })

  it('ignora a los proveedores desactivados', async () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('apagado'), { ...OK, priority: 1, enabled: false })
    registry.register(makeProvider('encendido'), { ...OK, priority: 2 })

    const quote = await registry.execute('quote', { symbol: 'AAPL' })
    expect(quote.source).toBe('encendido')
  })

  it('ignora a los proveedores que requieren clave y no la tienen', async () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('sinclave', { requiresApiKey: true }), {
      ...OK,
      priority: 1,
      hasCredential: false,
    })
    registry.register(makeProvider('libre'), { ...OK, priority: 2 })

    const quote = await registry.execute('quote', { symbol: 'AAPL' })
    expect(quote.source).toBe('libre')
  })

  it('falla con PROVIDER_UNAVAILABLE cuando nadie puede atender', async () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('unico', { requiresApiKey: true }), {
      ...OK,
      hasCredential: false,
    })

    await expect(registry.execute('quote', { symbol: 'AAPL' })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
  })
})

describe('ProviderRegistry — caché', () => {
  it('no vuelve a llamar al proveedor dentro del TTL', async () => {
    const spy = vi.fn(async ({ symbol }: { symbol: string }) => quoteOf(symbol, 1, 'p'))
    const registry = new ProviderRegistry()
    registry.register(makeProvider('p', { methods: { quote: spy } }), OK)

    await registry.execute('quote', { symbol: 'AAPL' })
    await registry.execute('quote', { symbol: 'AAPL' })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('distingue consultas distintas', async () => {
    const spy = vi.fn(async ({ symbol }: { symbol: string }) => quoteOf(symbol, 1, 'p'))
    const registry = new ProviderRegistry()
    registry.register(makeProvider('p', { methods: { quote: spy } }), OK)

    await registry.execute('quote', { symbol: 'AAPL' })
    await registry.execute('quote', { symbol: 'MSFT' })

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('invalida la caché del proveedor al cambiar su configuración', async () => {
    const spy = vi.fn(async ({ symbol }: { symbol: string }) => quoteOf(symbol, 1, 'p'))
    const registry = new ProviderRegistry()
    registry.register(makeProvider('p', { methods: { quote: spy } }), OK)

    await registry.execute('quote', { symbol: 'AAPL' })
    registry.updateConfig('p', { ...OK, priority: 5 })
    await registry.execute('quote', { symbol: 'AAPL' })

    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('ProviderRegistry — cuota', () => {
  it('devuelve RATE_LIMITED cuando todos se quedan sin fichas', async () => {
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider('estrecho', { rateLimit: { capacity: 1, refillPerSecond: 0.001 } }),
      OK,
    )

    await registry.execute('quote', { symbol: 'AAPL' })
    // Otro símbolo para no dar en la caché y forzar el consumo de ficha.
    await expect(registry.execute('quote', { symbol: 'MSFT' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    })
  })

  it('pasa al siguiente proveedor si el preferente no tiene fichas', async () => {
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider('agotado', { rateLimit: { capacity: 1, refillPerSecond: 0.001 } }),
      { ...OK, priority: 1 },
    )
    registry.register(makeProvider('holgado'), { ...OK, priority: 2 })

    await registry.execute('quote', { symbol: 'AAPL' })
    const second = await registry.execute('quote', { symbol: 'MSFT' })

    expect(second.source).toBe('holgado')
  })
})

describe('ProviderRegistry — estado de capacidades', () => {
  it('marca como no disponible lo que ningún proveedor implementa', () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('p'), OK)

    const statuses = registry.capabilityStatuses()
    const screener = statuses.find((s) => s.capability === 'screener')

    expect(screener?.state).toBe('unavailable')
    expect(screener?.provider).toBeNull()
    expect(screener?.reason).toBeTruthy()
  })

  it('marca disponible lo que sí hay, con el proveedor que lo sirve', () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('p'), OK)

    const quote = registry.capabilityStatuses().find((s) => s.capability === 'quote')
    expect(quote?.state).toBe('available')
    expect(quote?.provider).toBe('p')
  })

  it('explica que falta la clave cuando ese es el motivo', () => {
    const registry = new ProviderRegistry()
    registry.register(makeProvider('p', { requiresApiKey: true }), {
      ...OK,
      hasCredential: false,
    })

    const quote = registry.capabilityStatuses().find((s) => s.capability === 'quote')
    expect(quote?.state).toBe('unavailable')
    expect(quote?.reason).toMatch(/clave de API/i)
  })

  it('reporta "degraded", no "available", cuando la cuota está agotada', async () => {
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider('p', { rateLimit: { capacity: 1, refillPerSecond: 0.001 } }),
      OK,
    )

    await registry.execute('quote', { symbol: 'AAPL' })

    const quote = registry.capabilityStatuses().find((s) => s.capability === 'quote')
    expect(quote?.state).toBe('degraded')
    expect(quote?.reason).toMatch(/cuota/i)
  })

  it('reporta "degraded" tras un fallo del proveedor', async () => {
    const registry = new ProviderRegistry()
    registry.register(
      makeProvider('p', {
        methods: {
          quote: async () => {
            throw new Error('timeout hablando con el proveedor')
          },
        },
      }),
      OK,
    )

    await expect(registry.execute('quote', { symbol: 'AAPL' })).rejects.toThrow()

    const quote = registry.capabilityStatuses().find((s) => s.capability === 'quote')
    expect(quote?.state).toBe('degraded')
    expect(quote?.reason).toMatch(/timeout/i)
  })
})

/**
 * La búsqueda une resultados en vez de quedarse con el primer proveedor que
 * conteste. Nació de un fallo concreto: buscar «bitcoin» devolvía cinco ETFs
 * indexados por Finnhub y Bitcoin no aparecía, porque el primer proveedor
 * llenaba el cupo entero.
 */
describe('ProviderRegistry — búsqueda combinada', () => {
  const searchProvider = (id: string, symbols: string[]): MarketDataProvider =>
    makeProvider(id, {
      methods: {
        search: async () =>
          symbols.map((symbol) => ({
            symbol,
            name: symbol,
            assetClass: 'stock' as const,
            exchange: null,
            currency: null,
          })),
      },
    })

  it('intercala por turnos para que toda fuente aparezca', async () => {
    const registry = new ProviderRegistry()
    registry.register(searchProvider('acciones', ['GBTC', 'PXPC', 'ABTC']), { ...OK, priority: 1 })
    registry.register(searchProvider('cripto', ['BTC', 'BCH']), { ...OK, priority: 2 })

    const results = await registry.execute('search', { text: 'bitcoin', limit: 4 })

    // Sin turnos, las tres primeras del proveedor de acciones agotaban el cupo.
    expect(results.map((r) => r.symbol)).toEqual(['GBTC', 'BTC', 'PXPC', 'BCH'])
  })

  it('pone primero la coincidencia exacta de símbolo', async () => {
    const registry = new ProviderRegistry()
    registry.register(searchProvider('acciones', ['GBTC', 'BTCS']), { ...OK, priority: 1 })
    registry.register(searchProvider('cripto', ['BTC']), { ...OK, priority: 2 })

    const results = await registry.execute('search', { text: 'BTC', limit: 3 })

    expect(results[0]?.symbol).toBe('BTC')
  })

  it('no repite un activo que dos proveedores conocen', async () => {
    const registry = new ProviderRegistry()
    registry.register(searchProvider('a', ['AAPL', 'MSFT']), { ...OK, priority: 1 })
    registry.register(searchProvider('b', ['AAPL', 'NVDA']), { ...OK, priority: 2 })

    const results = await registry.execute('search', { text: 'x', limit: 10 })

    expect(results.map((r) => r.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA'])
  })

  it('un proveedor que falla no rompe la búsqueda de los demás', async () => {
    const roto = makeProvider('roto', {
      methods: {
        search: async () => {
          throw new Error('caído')
        },
      },
    })

    const registry = new ProviderRegistry()
    registry.register(roto, { ...OK, priority: 1 })
    registry.register(searchProvider('sano', ['AAPL']), { ...OK, priority: 2 })

    const results = await registry.execute('search', { text: 'apple', limit: 5 })
    expect(results.map((r) => r.symbol)).toEqual(['AAPL'])
  })

  it('devuelve lista vacía, no error, cuando nadie encuentra nada', async () => {
    const registry = new ProviderRegistry()
    registry.register(searchProvider('a', []), OK)

    await expect(registry.execute('search', { text: 'zzz', limit: 5 })).resolves.toEqual([])
  })
})
