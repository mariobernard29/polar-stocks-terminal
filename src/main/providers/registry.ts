import { CAPABILITIES, type Capability, type CapabilityStatus } from '@shared/domain'
import { AppError } from '../ipc/app-error'
import { RateLimiter } from '../cache/rate-limiter'
import { TtlCache } from '../cache/ttl-cache'
import { logger } from '../lib/logger'
import {
  CAPABILITY_TTL_MS,
  capabilitiesOf,
  EMPTY_MEANS_NO_ANSWER,
  MERGED_CAPABILITIES,
  type CapabilityMethods,
  type ImplementedCapability,
  type MarketDataProvider,
} from './types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Registro de proveedores
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Resuelve "quién me da esta capacidad" y se encarga de caché, cuota y
 * failover. Es lo que convierte «si una API no está configurada, la app sigue
 * funcionando con las demás y muestra qué está deshabilitado» en una propiedad
 * de la arquitectura, en vez de un `if` repartido por la interfaz.
 */

export interface ProviderRuntimeConfig {
  /** El usuario puede desactivar un proveedor sin borrar su clave. */
  readonly enabled: boolean
  /** Menor = se intenta antes. */
  readonly priority: number
  /** Si hay credencial guardada. Los que no la requieren van siempre a true. */
  readonly hasCredential: boolean
}

interface Registration {
  readonly provider: MarketDataProvider
  readonly capabilities: ReadonlySet<ImplementedCapability>
  readonly limiter: RateLimiter
  config: ProviderRuntimeConfig
  /** Último error, para explicar en la interfaz por qué algo está degradado. */
  lastError: string | null
}

/**
 * Desplazamiento de los proveedores de respaldo.
 *
 * Muy por encima de cualquier prioridad configurable (el contrato IPC la acota
 * a 1000), así que un proveedor de respaldo nunca puede adelantar a uno real.
 */
const FALLBACK_PRIORITY_FLOOR = 1_000_000

/** Motivo por el que un proveedor no puede atender ahora mismo. */
type Unusable = 'disabled' | 'missingCredential' | 'rateLimited'

export class ProviderRegistry {
  readonly #registrations = new Map<string, Registration>()
  readonly #cache: TtlCache<unknown>

  constructor(options?: { cacheMaxEntries?: number }) {
    this.#cache = new TtlCache<unknown>({ maxEntries: options?.cacheMaxEntries ?? 500 })
  }

  register(provider: MarketDataProvider, config: ProviderRuntimeConfig): void {
    this.#registrations.set(provider.id, {
      provider,
      capabilities: capabilitiesOf(provider),
      limiter: new RateLimiter(provider.rateLimit),
      config,
      lastError: null,
    })
  }

  /**
   * Actualiza la configuración de un proveedor.
   *
   * Al cambiar, se invalida su caché: si el usuario acaba de desactivar un
   * proveedor, seguir sirviendo sus datos cacheados sería mentirle sobre de
   * dónde viene lo que está mirando.
   */
  updateConfig(providerId: string, config: ProviderRuntimeConfig): void {
    const registration = this.#registrations.get(providerId)
    if (!registration) return
    registration.config = config
    registration.lastError = null
    this.#cache.deleteByPrefix(`${providerId}:`)
  }

  #unusableReason(registration: Registration): Unusable | null {
    if (!registration.config.enabled) return 'disabled'
    if (registration.provider.requiresApiKey && !registration.config.hasCredential) {
      return 'missingCredential'
    }
    return null
  }

  /**
   * Proveedores que pueden atender una capacidad, en orden de preferencia.
   *
   * Se aplica también el filtro `supports` del proveedor, que descarta consultas
   * concretas antes de gastar cuota: implementar `quote` no implica poder servir
   * cualquier símbolo.
   */
  #candidatesFor(capability: ImplementedCapability, query: unknown): Registration[] {
    return [...this.#registrations.values()]
      .filter(
        (r) =>
          r.capabilities.has(capability) &&
          this.#unusableReason(r) === null &&
          (r.provider.supports?.(capability, query) ?? true),
      )
      .sort(
        (a, b) =>
          this.#effectivePriority(a, capability) - this.#effectivePriority(b, capability),
      )
  }

  /**
   * Prioridad del usuario más el ajuste por capacidad del proveedor.
   *
   * Los proveedores de respaldo se desplazan a un rango inalcanzable: da igual
   * qué prioridad tengan configurada, nunca se anteponen a uno real. Sin esto,
   * una fila con prioridad baja en la base de datos bastaba para que datos
   * simulados sustituyeran a datos de mercado sin previo aviso.
   */
  #effectivePriority(registration: Registration, capability: ImplementedCapability): number {
    const base =
      registration.config.priority +
      (registration.provider.capabilityPriorityOffset?.[capability] ?? 0)

    return registration.provider.isFallback ? base + FALLBACK_PRIORITY_FLOOR : base
  }

  /**
   * Estado de todas las capacidades del dominio, incluidas las que ningún
   * proveedor implementa todavía.
   *
   * Es lo que consume la interfaz para marcar funciones como no disponibles sin
   * que ningún componente sepa nombres de proveedores.
   */
  capabilityStatuses(): CapabilityStatus[] {
    return CAPABILITIES.map((capability) => this.#statusFor(capability))
  }

  #statusFor(capability: Capability): CapabilityStatus {
    const implemented = capability as ImplementedCapability
    const supporting = [...this.#registrations.values()].filter((r) =>
      r.capabilities.has(implemented),
    )

    if (supporting.length === 0) {
      return {
        capability,
        state: 'unavailable',
        provider: null,
        reason: 'Ningún proveedor configurado ofrece esta función todavía.',
      }
    }

    const usable = supporting
      .filter((r) => this.#unusableReason(r) === null)
      .sort(
        (a, b) =>
          this.#effectivePriority(a, implemented) - this.#effectivePriority(b, implemented),
      )

    if (usable.length === 0) {
      const reasons = supporting.map((r) => this.#unusableReason(r))
      const reason = reasons.includes('missingCredential')
        ? 'Falta configurar la clave de API del proveedor.'
        : 'Todos los proveedores de esta función están desactivados.'
      return { capability, state: 'unavailable', provider: null, reason }
    }

    const primary = usable[0]
    if (!primary) {
      return { capability, state: 'unavailable', provider: null, reason: null }
    }

    // Sin fichas disponibles la función sigue existiendo, pero va a esperar: es
    // exactamente lo que significa "degradado". Ocultarlo sería mentir.
    if (primary.limiter.availableTokens === 0) {
      return {
        capability,
        state: 'degraded',
        provider: primary.provider.id,
        reason: 'Cuota del proveedor agotada temporalmente.',
      }
    }

    if (primary.lastError !== null) {
      return {
        capability,
        state: 'degraded',
        provider: primary.provider.id,
        reason: primary.lastError,
      }
    }

    return { capability, state: 'available', provider: primary.provider.id, reason: null }
  }

  /**
   * Ejecuta una capacidad: caché → cuota → proveedor, con failover.
   *
   * Si el proveedor preferente falla, se intenta el siguiente en vez de
   * propagar el error. Un proveedor caído no debe dejar la terminal sin datos
   * cuando hay otro configurado que puede servirlos.
   */
  async execute<K extends ImplementedCapability>(
    capability: K,
    query: Parameters<CapabilityMethods[K]>[0],
  ): Promise<Awaited<ReturnType<CapabilityMethods[K]>>> {
    const candidates = this.#candidatesFor(capability, query)

    if (candidates.length === 0) {
      const status = this.#statusFor(capability)
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        status.reason ?? 'No hay ningún proveedor disponible para esta función.',
      )
    }

    const querySuffix = JSON.stringify(query)

    if (MERGED_CAPABILITIES.has(capability)) {
      return this.#executeMerged(capability, query, candidates, querySuffix)
    }

    let lastError: unknown = null
    let everyoneRateLimited = true

    for (const registration of candidates) {
      const cacheKey = `${registration.provider.id}:${capability}:${querySuffix}`

      const cached = this.#cache.get(cacheKey)
      if (cached !== undefined) {
        return cached as Awaited<ReturnType<CapabilityMethods[K]>>
      }

      if (!registration.limiter.tryAcquire()) {
        logger.warn(`[providers] ${registration.provider.id} sin cuota para ${capability}`)
        continue
      }
      everyoneRateLimited = false

      const method = registration.provider.methods[capability]
      if (!method) continue

      try {
        const result = await (method as CapabilityMethods[K])(
          query as never,
        )

        // Una lista vacía en búsquedas o noticias no es una respuesta: se sigue
        // preguntando. Ver `EMPTY_MEANS_NO_ANSWER`.
        if (
          EMPTY_MEANS_NO_ANSWER.has(capability) &&
          Array.isArray(result) &&
          result.length === 0
        ) {
          registration.lastError = null
          continue
        }

        this.#cache.set(cacheKey, result, CAPABILITY_TTL_MS[capability])
        registration.lastError = null
        return result as Awaited<ReturnType<CapabilityMethods[K]>>
      } catch (error) {
        lastError = error
        registration.lastError =
          error instanceof Error ? error.message : 'Error desconocido del proveedor'
        logger.warn(
          `[providers] ${registration.provider.id} falló en ${capability}: ${registration.lastError}`,
        )
        // Se continúa con el siguiente candidato: eso es el failover.
      }
    }

    if (everyoneRateLimited) {
      const waits = candidates.map((r) => r.limiter.msUntilAvailable())
      throw new AppError(
        'RATE_LIMITED',
        'Se ha agotado la cuota de los proveedores disponibles.',
        { details: `Reintentar en ~${Math.ceil(Math.min(...waits) / 1000)} s`, retryable: true },
      )
    }

    // Todos respondieron vacío: eso es un resultado legítimo (nadie lo tiene),
    // no un fallo. Devolver un error aquí haría que la interfaz mostrara «error
    // de red» cuando lo cierto es que no hay coincidencias.
    if (lastError === null && EMPTY_MEANS_NO_ANSWER.has(capability)) {
      return [] as Awaited<ReturnType<CapabilityMethods[K]>>
    }

    if (lastError instanceof AppError) throw lastError
    throw new AppError(
      'NETWORK_ERROR',
      'Ningún proveedor pudo atender la petición.',
      {
        details: lastError instanceof Error ? lastError.message : undefined,
        retryable: true,
        cause: lastError,
      },
    )
  }

  /**
   * Consulta a **todos** los proveedores y une los resultados.
   *
   * Se pregunta en paralelo, no en cadena: son fuentes independientes y
   * esperarlas una detrás de otra multiplicaría la latencia de cada pulsación
   * en el buscador.
   *
   * Un proveedor que falle o se quede sin cuota no rompe la búsqueda: aporta
   * cero resultados y los demás siguen contando.
   */
  async #executeMerged<K extends ImplementedCapability>(
    capability: K,
    query: Parameters<CapabilityMethods[K]>[0],
    candidates: readonly Registration[],
    querySuffix: string,
  ): Promise<Awaited<ReturnType<CapabilityMethods[K]>>> {
    const perProvider = await Promise.all(
      candidates.map(async (registration) => {
        const cacheKey = `${registration.provider.id}:${capability}:${querySuffix}`

        const cached = this.#cache.get(cacheKey)
        if (cached !== undefined) return cached as unknown[]

        if (!registration.limiter.tryAcquire()) return []

        const method = registration.provider.methods[capability]
        if (!method) return []

        try {
          const result = (await (method as CapabilityMethods[K])(query as never)) as unknown[]
          this.#cache.set(cacheKey, result, CAPABILITY_TTL_MS[capability])
          registration.lastError = null
          return result
        } catch (error) {
          registration.lastError =
            error instanceof Error ? error.message : 'Error desconocido del proveedor'
          return []
        }
      }),
    )

    /**
     * Intercalado por turnos, no concatenado.
     *
     * Concatenando en orden de prioridad, el primer proveedor llenaba el cupo
     * entero: buscar «bitcoin» devolvía cinco ETFs de Finnhub y **Bitcoin no
     * aparecía**, aunque CoinGecko lo tenía en primera posición. Por turnos,
     * cada fuente coloca su mejor resultado antes de que ninguna coloque el
     * segundo.
     *
     * El deduplicado conserva la primera aparición, que por el orden de turnos
     * es la del proveedor de mayor prioridad.
     */
    const seen = new Set<string>()
    const merged: unknown[] = []
    const deepest = Math.max(0, ...perProvider.map((results) => results.length))

    for (let rank = 0; rank < deepest; rank += 1) {
      for (const results of perProvider) {
        const item = results[rank]
        if (item === undefined) continue

        const symbol = (item as { symbol?: string }).symbol
        const key = typeof symbol === 'string' ? symbol.toUpperCase() : JSON.stringify(item)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(item)
      }
    }

    // Coincidencia exacta de símbolo primero: quien escribe «BTC» quiere
    // Bitcoin, no el primer token cuyo nombre contenga esas letras.
    const needle = (query as { text?: string }).text?.trim().toUpperCase()
    if (needle) {
      merged.sort((a, b) => {
        const aExact = (a as { symbol?: string }).symbol?.toUpperCase() === needle ? 0 : 1
        const bExact = (b as { symbol?: string }).symbol?.toUpperCase() === needle ? 0 : 1
        return aExact - bExact
      })
    }

    const limit = (query as { limit?: number }).limit ?? merged.length
    return merged.slice(0, limit) as Awaited<ReturnType<CapabilityMethods[K]>>
  }

  /** Diagnóstico para Configuración. */
  get cacheStats(): { hits: number; misses: number; size: number } {
    return this.#cache.stats
  }

  clearCache(): void {
    this.#cache.clear()
  }
}
