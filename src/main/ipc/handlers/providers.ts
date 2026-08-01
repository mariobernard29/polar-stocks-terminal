import type { ProviderSummary } from '@shared/ipc/contract'
import { getPrisma } from '../../db/client'
import { logger } from '../../lib/logger'
import {
  ALL_PROVIDERS,
  describeProviders,
  findProvider,
  getRegistry,
  refreshProviders,
} from '../../providers'
import { capabilitiesOf } from '../../providers/types'
import {
  listCredentials,
  removeCredential,
  setCredential,
  setProviderConfig,
} from '../../security/credentials'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

/**
 * Índice de capacidades por proveedor, calculado una vez.
 *
 * Se deriva de `ALL_PROVIDERS`, no de una lista escrita a mano: añadir un
 * proveedor nuevo no requiere acordarse de tocar esto.
 */
const CAPABILITIES_BY_PROVIDER = new Map<string, string[]>(
  ALL_PROVIDERS.map((provider) => [provider.id, [...capabilitiesOf(provider)].sort()]),
)

export const list: IpcHandler<'providers:list'> = async (): Promise<ProviderSummary[]> => {
  const credentials = await listCredentials()
  const byProvider = new Map(credentials.map((c) => [c.provider, c]))

  return describeProviders().map((provider) => {
    const credential = byProvider.get(provider.id)

    return {
      id: provider.id,
      displayName: provider.displayName,
      requiresApiKey: provider.requiresApiKey,
      docsUrl: provider.docsUrl,
      hasSecret: credential?.hasSecret ?? false,
      masked: credential?.masked ?? null,
      enabled: credential?.enabled ?? true,
      priority: credential?.priority ?? (provider.requiresApiKey ? 100 : 200),
      // Las fechas cruzan el IPC como epoch ms, igual que en todo el dominio.
      lastCheckedAt: credential?.lastCheckedAt?.getTime() ?? null,
      lastCheckOk: credential?.lastCheckOk ?? null,
      lastCheckNote: credential?.lastCheckNote ?? null,
      capabilities: CAPABILITIES_BY_PROVIDER.get(provider.id) ?? [],
    }
  })
}

export const setCredentialHandler: IpcHandler<'providers:setCredential'> = async ({
  provider,
  apiKey,
}) => {
  await setCredential(provider, apiKey)
  // Recargar deja el cambio activo al momento, sin reiniciar la aplicación.
  await refreshProviders()
}

export const removeCredentialHandler: IpcHandler<'providers:removeCredential'> = async ({
  provider,
}) => {
  await removeCredential(provider)
  await refreshProviders()
}

export const setConfig: IpcHandler<'providers:setConfig'> = async ({
  provider,
  enabled,
  priority,
}) => {
  if (enabled === undefined && priority === undefined) {
    throw new AppError('VALIDATION_FAILED', 'No se indicó ningún cambio de configuración.')
  }

  await setProviderConfig(provider, {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(priority !== undefined ? { priority } : {}),
  })
  await refreshProviders()
}

export const capabilities: IpcHandler<'providers:capabilities'> = () =>
  getRegistry().capabilityStatuses()

/**
 * Comprueba una credencial haciendo una llamada real.
 *
 * Se elige la capacidad más barata que el proveedor implemente y se pide un
 * símbolo muy líquido. El resultado se guarda en la fila del proveedor para
 * poder mostrarlo después sin repetir la llamada.
 *
 * Nunca lanza: un fallo de comprobación **es** el resultado, no un error de la
 * operación. La interfaz necesita el motivo para mostrarlo, no una excepción.
 */
export const test: IpcHandler<'providers:test'> = async ({ provider }) => {
  const definition = findProvider(provider)
  if (!definition) {
    return { ok: false, message: 'Ese proveedor no existe.' }
  }

  const probe =
    definition.methods.quote ?? definition.methods.cryptoQuote ?? definition.methods.search

  if (!probe) {
    return { ok: false, message: 'Este proveedor no ofrece ninguna llamada de comprobación.' }
  }

  let ok = false
  let message: string

  try {
    // `search` toma otra forma de consulta que `quote`; se cubren ambas.
    await (definition.methods.quote
      ? definition.methods.quote({ symbol: 'AAPL' })
      : definition.methods.cryptoQuote
        ? definition.methods.cryptoQuote({ symbol: 'BTC' })
        : definition.methods.search?.({ text: 'AAPL', limit: 1 }))

    ok = true
    message = 'La credencial funciona.'
  } catch (error) {
    message =
      error instanceof AppError
        ? `${error.message}${error.details ? ` (${error.details})` : ''}`
        : 'No se pudo comprobar la credencial.'
  }

  await recordCheck(provider, ok, message)
  return { ok, message }
}

async function recordCheck(provider: string, ok: boolean, note: string): Promise<void> {
  try {
    await getPrisma().apiCredential.upsert({
      where: { provider },
      create: { provider, lastCheckedAt: new Date(), lastCheckOk: ok, lastCheckNote: note },
      update: { lastCheckedAt: new Date(), lastCheckOk: ok, lastCheckNote: note },
    })
  } catch (error) {
    logger.warn(`[providers] no se pudo registrar la comprobación de ${provider}`, error)
  }
}
