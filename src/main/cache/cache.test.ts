import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rate-limiter'
import { TtlCache } from './ttl-cache'

/** Reloj controlado: probar tiempo durmiendo el test lo haría lento y frágil. */
function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start
  return {
    now: () => current,
    advance: (ms) => {
      current += ms
    },
  }
}

describe('TtlCache', () => {
  it('devuelve el valor antes de expirar y nada después', () => {
    const clock = fakeClock()
    const cache = new TtlCache<string>({ maxEntries: 10, now: clock.now })

    cache.set('quote:AAPL', '190.5', 5000)
    expect(cache.get('quote:AAPL')).toBe('190.5')

    clock.advance(4999)
    expect(cache.get('quote:AAPL')).toBe('190.5')

    clock.advance(2)
    expect(cache.get('quote:AAPL')).toBeUndefined()
  })

  it('desaloja la entrada menos usada recientemente, no la más antigua', () => {
    const cache = new TtlCache<number>({ maxEntries: 2 })

    cache.set('a', 1, 60_000)
    cache.set('b', 2, 60_000)
    // Al leer 'a' pasa a ser la más reciente, así que 'b' debe ser la desalojada.
    cache.get('a')
    cache.set('c', 3, 60_000)

    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })

  it('libera la entrada expirada en lugar de conservarla ocupando sitio', () => {
    const clock = fakeClock()
    const cache = new TtlCache<number>({ maxEntries: 5, now: clock.now })

    cache.set('a', 1, 1000)
    expect(cache.size).toBe(1)

    clock.advance(1001)
    cache.get('a')
    expect(cache.size).toBe(0)
  })

  it('invalida por prefijo, que es como se desactiva un proveedor', () => {
    const cache = new TtlCache<number>({ maxEntries: 10 })
    cache.set('finnhub:quote:AAPL', 1, 60_000)
    cache.set('finnhub:quote:MSFT', 2, 60_000)
    cache.set('polygon:quote:AAPL', 3, 60_000)

    expect(cache.deleteByPrefix('finnhub:')).toBe(2)
    expect(cache.get('finnhub:quote:AAPL')).toBeUndefined()
    expect(cache.get('polygon:quote:AAPL')).toBe(3)
  })

  it('ignora un ttl no positivo en vez de cachear para siempre', () => {
    const cache = new TtlCache<number>({ maxEntries: 5 })
    cache.set('a', 1, 0)
    cache.set('b', 2, -100)
    expect(cache.size).toBe(0)
  })
})

describe('RateLimiter', () => {
  it('permite una ráfaga hasta la capacidad y luego corta', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter({ capacity: 5, refillPerSecond: 1, now: clock.now })

    for (let i = 0; i < 5; i += 1) {
      expect(limiter.tryAcquire(), `ficha ${i + 1}`).toBe(true)
    }
    expect(limiter.tryAcquire()).toBe(false)
  })

  it('repone fichas con el paso del tiempo', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 2, now: clock.now })

    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)

    clock.advance(500) // 0,5 s × 2 fichas/s = 1 ficha
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)
  })

  it('nunca acumula por encima de la capacidad aunque pase mucho tiempo', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 10, now: clock.now })

    clock.advance(60_000)
    expect(limiter.availableTokens).toBe(3)
  })

  it('informa cuánto falta para la siguiente ficha', () => {
    const clock = fakeClock()
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 2, now: clock.now })

    expect(limiter.msUntilAvailable()).toBe(0)
    limiter.tryAcquire()
    // A 2 fichas/s, una ficha tarda 500 ms.
    expect(limiter.msUntilAvailable()).toBe(500)

    clock.advance(500)
    expect(limiter.msUntilAvailable()).toBe(0)
  })

  it('rechaza configuraciones sin sentido en vez de comportarse raro', () => {
    expect(() => new RateLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow()
    expect(() => new RateLimiter({ capacity: 1, refillPerSecond: 0 })).toThrow()
  })
})
