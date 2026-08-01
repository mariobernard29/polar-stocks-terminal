/**
 * Limitador de peticiones por cubo de fichas (token bucket).
 *
 * Cada proveedor trae su propio límite y su propio plan: Finnhub gratuito son
 * 60 llamadas por minuto, Polygon gratuito 5. Se configura por proveedor porque
 * un único límite global sería o inútil o innecesariamente lento.
 *
 * El cubo permite ráfagas hasta `capacity` y luego reparte a `refillPerSecond`.
 * Es preferible a una ventana fija: abrir un layout con doce paneles debe
 * funcionar de golpe, no espaciarse artificialmente.
 */
export interface RateLimiterOptions {
  /** Fichas máximas acumulables. Es el tamaño de ráfaga permitido. */
  readonly capacity: number
  /** Ritmo de reposición. */
  readonly refillPerSecond: number
  readonly now?: () => number
}

export class RateLimiter {
  readonly #capacity: number
  readonly #refillPerSecond: number
  readonly #now: () => number

  #tokens: number
  #lastRefill: number

  constructor(options: RateLimiterOptions) {
    if (options.capacity < 1) throw new Error('capacity debe ser al menos 1')
    if (options.refillPerSecond <= 0) throw new Error('refillPerSecond debe ser positivo')

    this.#capacity = options.capacity
    this.#refillPerSecond = options.refillPerSecond
    this.#now = options.now ?? Date.now
    this.#tokens = options.capacity
    this.#lastRefill = this.#now()
  }

  #refill(): void {
    const now = this.#now()
    const elapsedSeconds = (now - this.#lastRefill) / 1000
    if (elapsedSeconds <= 0) return

    this.#tokens = Math.min(this.#capacity, this.#tokens + elapsedSeconds * this.#refillPerSecond)
    this.#lastRefill = now
  }

  /** Consume una ficha si hay. No espera: devuelve si pudo o no. */
  tryAcquire(): boolean {
    this.#refill()
    if (this.#tokens < 1) return false
    this.#tokens -= 1
    return true
  }

  /**
   * Milisegundos hasta que haya una ficha disponible.
   * Cero si se puede consumir ya.
   */
  msUntilAvailable(): number {
    this.#refill()
    if (this.#tokens >= 1) return 0
    return Math.ceil(((1 - this.#tokens) / this.#refillPerSecond) * 1000)
  }

  get availableTokens(): number {
    this.#refill()
    return Math.floor(this.#tokens)
  }
}
