import { getPrisma } from '../db/client'
import { logger } from '../lib/logger'
import { getCredential } from '../security/credentials'
import { createCoinGeckoProvider, COINGECKO_PROVIDER_ID } from './coingecko'
import { createFinnhubProvider, FINNHUB_PROVIDER_ID } from './finnhub'
import { createFmpProvider, FMP_PROVIDER_ID } from './fmp'
import { createNewsApiProvider, NEWSAPI_PROVIDER_ID } from './newsapi'
import { createPolygonProvider, POLYGON_PROVIDER_ID } from './polygon'
import { mockProvider } from './mock'
import { ProviderRegistry, type ProviderRuntimeConfig } from './registry'
import type { MarketDataProvider } from './types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Arranque de la capa de proveedores
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Las claves descifradas se mantienen **en memoria del proceso main**, no se
 * descifran en cada llamada: `safeStorage.decryptString` habla con el llavero
 * del sistema operativo y hacerlo en cada cotización sería lento y ruidoso.
 * Nunca salen de este proceso.
 */

/** Claves en claro, solo dentro del proceso main. */
const tokens = new Map<string, string>()

const tokenFor = (providerId: string): string | null => tokens.get(providerId) ?? null

/**
 * Proveedores registrados.
 *
 * El simulado se queda junto a los reales, con la prioridad más baja: es lo que
 * permite que la aplicación siga siendo utilizable sin conexión o sin ninguna
 * clave configurada, y lo que hace reproducibles las pruebas de interfaz.
 */
const ALL_PROVIDERS: readonly MarketDataProvider[] = [
  createFinnhubProvider(() => tokenFor(FINNHUB_PROVIDER_ID)),
  createCoinGeckoProvider(() => tokenFor(COINGECKO_PROVIDER_ID)),
  createFmpProvider(() => tokenFor(FMP_PROVIDER_ID)),
  createPolygonProvider(() => tokenFor(POLYGON_PROVIDER_ID)),
  createNewsApiProvider(() => tokenFor(NEWSAPI_PROVIDER_ID)),
  mockProvider,
]

let registry: ProviderRegistry | null = null

/** Recarga en memoria las claves de los proveedores que las necesitan. */
async function loadTokens(): Promise<void> {
  tokens.clear()
  for (const provider of ALL_PROVIDERS) {
    if (!provider.requiresApiKey) continue
    const secret = await getCredential(provider.id)
    if (secret) tokens.set(provider.id, secret)
  }
}

/** Configuración de un proveedor, con valores por defecto si no hay fila. */
async function loadConfig(provider: MarketDataProvider): Promise<ProviderRuntimeConfig> {
  const row = await getPrisma().apiCredential.findUnique({
    where: { provider: provider.id },
    select: { enabled: true, priority: true, secret: true },
  })

  if (!row) {
    return {
      enabled: true,
      // Los proveedores reales se intentan antes que el simulado. Sin esto, el
      // simulado ganaría siempre y los datos reales no llegarían nunca.
      priority: provider.requiresApiKey ? 10 : 900,
      hasCredential: !provider.requiresApiKey,
    }
  }

  return {
    enabled: row.enabled,
    priority: row.priority,
    hasCredential: provider.requiresApiKey ? row.secret !== null : true,
  }
}

export async function initProviders(): Promise<ProviderRegistry> {
  const created = new ProviderRegistry()
  await loadTokens()

  for (const provider of ALL_PROVIDERS) {
    created.register(provider, await loadConfig(provider))
  }

  registry = created

  const withKey = ALL_PROVIDERS.filter((p) => !p.requiresApiKey || tokens.has(p.id)).length
  logger.info(`[providers] ${ALL_PROVIDERS.length} registrados, ${withKey} utilizables`)
  return created
}

export function getRegistry(): ProviderRegistry {
  if (!registry) {
    throw new Error('La capa de proveedores no está inicializada.')
  }
  return registry
}

/**
 * Recarga claves y configuración desde la base de datos.
 *
 * Se llama tras guardar una clave o cambiar prioridades, para que el efecto sea
 * inmediato y el usuario no tenga que reiniciar la aplicación.
 */
export async function refreshProviders(): Promise<void> {
  const current = getRegistry()
  await loadTokens()
  for (const provider of ALL_PROVIDERS) {
    current.updateConfig(provider.id, await loadConfig(provider))
  }
}

/** Metadatos estáticos para la pantalla de Configuración. */
export function describeProviders(): {
  id: string
  displayName: string
  requiresApiKey: boolean
  docsUrl: string | null
}[] {
  return ALL_PROVIDERS.map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    requiresApiKey: provider.requiresApiKey,
    docsUrl: provider.docsUrl,
  }))
}

/**
 * Clave del proveedor que sirve el flujo en tiempo real.
 *
 * Hoy es Finnhub. Se expone como función y no como valor porque la clave puede
 * cambiar mientras la aplicación corre, y el socket debe reconectar con la
 * nueva sin reiniciar nada.
 */
export function getStreamToken(): string | null {
  return tokenFor(FINNHUB_PROVIDER_ID)
}

export function findProvider(providerId: string): MarketDataProvider | undefined {
  return ALL_PROVIDERS.find((provider) => provider.id === providerId)
}

export { ALL_PROVIDERS }
