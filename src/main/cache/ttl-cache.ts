/**
 * Caché en memoria con expiración por entrada y desalojo LRU.
 *
 * Es el nivel más caliente de los tres: absorbe las ráfagas. Cuando ocho
 * paneles piden la cotización de AAPL en el mismo tick, solo la primera llega
 * al proveedor. Sin esto, la cuota de un plan gratuito se agota en minutos.
 *
 * El reloj se inyecta para poder probar la expiración sin dormir el test.
 */
export interface TtlCacheOptions {
  /** Máximo de entradas antes de desalojar la menos usada recientemente. */
  readonly maxEntries: number
  readonly now?: () => number
}

interface Entry<T> {
  readonly value: T
  readonly expiresAt: number
}

export class TtlCache<T> {
  readonly #entries = new Map<string, Entry<T>>()
  readonly #maxEntries: number
  readonly #now: () => number

  #hits = 0
  #misses = 0

  constructor(options: TtlCacheOptions) {
    if (options.maxEntries < 1) throw new Error('maxEntries debe ser al menos 1')
    this.#maxEntries = options.maxEntries
    this.#now = options.now ?? Date.now
  }

  get(key: string): T | undefined {
    const entry = this.#entries.get(key)
    if (!entry) {
      this.#misses += 1
      return undefined
    }

    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key)
      this.#misses += 1
      return undefined
    }

    // Reinsertar mueve la clave al final: `Map` conserva el orden de inserción,
    // así que la primera clave es siempre la menos usada recientemente.
    this.#entries.delete(key)
    this.#entries.set(key, entry)
    this.#hits += 1
    return entry.value
  }

  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return

    // Se borra primero para que una reescritura también renueve la posición LRU.
    this.#entries.delete(key)
    this.#entries.set(key, { value, expiresAt: this.#now() + ttlMs })

    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next()
      if (oldest.done === true) break
      this.#entries.delete(oldest.value)
    }
  }

  delete(key: string): void {
    this.#entries.delete(key)
  }

  /** Invalida por prefijo. Se usa al desactivar un proveedor. */
  deleteByPrefix(prefix: string): number {
    let removed = 0
    for (const key of [...this.#entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.#entries.delete(key)
        removed += 1
      }
    }
    return removed
  }

  clear(): void {
    this.#entries.clear()
  }

  get size(): number {
    return this.#entries.size
  }

  /** Estadísticas para el panel de diagnóstico de Configuración. */
  get stats(): { hits: number; misses: number; size: number } {
    return { hits: this.#hits, misses: this.#misses, size: this.#entries.size }
  }
}
