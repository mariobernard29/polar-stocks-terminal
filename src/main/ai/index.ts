import type { BrowserWindow } from 'electron'
import { composeUserMessage, systemPrompt } from '@shared/ai/prompt'
import { describeSources, serializeContext } from '@shared/ai/context'
import { getAllSettings } from '../db/repositories/settings'
import { emitIpcEvent } from '../ipc/register'
import { AppError } from '../ipc/app-error'
import { logger } from '../lib/logger'
import { getCredential } from '../security/credentials'
import { buildContext } from './context-builder'
import {
  createAnthropicProvider,
  createGeminiProvider,
  createOpenAiProvider,
} from './providers'
import type { AiMessage, AiProvider, AiProviderId } from './types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Polar AI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Orquesta las tres piezas: recopilar los datos, componer la pregunta y
 * transmitir la respuesta al renderer trozo a trozo.
 *
 * Las claves nunca salen de aquí, igual que las de los proveedores de mercado.
 * El renderer envía un texto y recibe otro; no sabe a qué servicio se ha
 * llamado ni con qué credencial.
 */

/**
 * Techo de la respuesta.
 *
 * El panel es una columna estrecha. Una respuesta más larga que esto no se lee
 * entera y sí se paga entera.
 */
const MAX_TOKENS = 1_500

/**
 * Turnos de conversación que se reenvían.
 *
 * Cada mensaje anterior vuelve a viajar en cada pregunta —así funcionan estas
 * APIs—, y cada uno lleva su bloque de datos. Sin un techo, la décima pregunta
 * de una charla costaría diez veces la primera y arrastraría cotizaciones ya
 * caducadas que contradicen a las nuevas.
 */
const MAX_HISTORY = 8

/** Los adaptadores no guardan estado, así que se construyen una sola vez. */
const providers: ReadonlyMap<AiProviderId, AiProvider> = new Map(
  [createAnthropicProvider(), createOpenAiProvider(), createGeminiProvider()].map(
    (provider) => [provider.id, provider],
  ),
)

/** Petición en curso. Solo se admite una: el panel es uno. */
let inFlight: AbortController | null = null

export interface AiProviderSummary {
  readonly id: AiProviderId
  readonly displayName: string
  readonly defaultModel: string
  readonly knownModels: string[]
  readonly docsUrl: string
  readonly hasKey: boolean
}

export async function listAiProviders(): Promise<AiProviderSummary[]> {
  const summaries: AiProviderSummary[] = []

  for (const provider of providers.values()) {
    summaries.push({
      id: provider.id,
      displayName: provider.displayName,
      defaultModel: provider.defaultModel,
      knownModels: [...provider.knownModels],
      docsUrl: provider.docsUrl,
      // Solo si existe, nunca cuál. La clave no cruza el IPC.
      hasKey: (await getCredential(provider.id)) !== null,
    })
  }

  return summaries
}

export interface AskOptions {
  readonly question: string
  readonly history: readonly AiMessage[]
  readonly focusSymbol: string | null
}

export interface AskResult {
  /** Qué datos se usaron, para que el usuario pueda comprobar la respuesta. */
  readonly sources: string[]
  /** Lo que se intentó obtener y falló. */
  readonly failures: string[]
  readonly provider: string
  readonly model: string
}

/** Cancela la respuesta en curso, si la hay. */
export function cancelAi(): void {
  inFlight?.abort()
  inFlight = null
}

/**
 * Pregunta a Polar AI y transmite la respuesta.
 *
 * Devuelve el resumen de fuentes **al terminar**, no al empezar: es lo que la
 * interfaz enseña bajo la respuesta para que cualquier cifra se pueda contrastar
 * con el dato del que salió. Esa comprobabilidad es la última línea de defensa
 * contra una cifra inventada, y la única que no depende del modelo.
 */
export async function ask(
  window: BrowserWindow | null,
  options: AskOptions,
): Promise<AskResult> {
  const settings = await getAllSettings()
  const providerId = settings['ai.provider']
  const provider = providers.get(providerId)

  if (!provider) {
    throw new AppError('PROVIDER_UNAVAILABLE', `Proveedor de IA desconocido: ${providerId}.`)
  }

  const key = await getCredential(providerId)
  if (!key) {
    throw new AppError(
      'MISSING_CREDENTIAL',
      `No hay clave configurada para ${provider.displayName}. Añádela en Configuración → APIs.`,
      { retryable: false },
    )
  }

  // Los datos se recopilan antes de preguntar. Es el punto entero del diseño:
  // el modelo no puede inventar una cifra que no le hemos dado si además le
  // decimos que fuera del bloque no hay nada.
  const context = await buildContext(options.question, {
    focusSymbol: options.focusSymbol,
  })

  const locale = settings['general.language']
  const model = settings['ai.model'].trim() || provider.defaultModel

  const messages: AiMessage[] = [
    ...options.history.slice(-MAX_HISTORY),
    { role: 'user', content: composeUserMessage(options.question, serializeContext(context)) },
  ]

  cancelAi()
  const controller = new AbortController()
  inFlight = controller

  try {
    await provider.stream(
      {
        apiKey: key,
        system: systemPrompt(locale),
        messages,
        model,
        maxTokens: MAX_TOKENS,
        signal: controller.signal,
      },
      (text) => emitIpcEvent(window, 'ai:delta', { text }),
    )
  } catch (error) {
    if (controller.signal.aborted) throw new AppError('CANCELLED', 'Respuesta cancelada.')
    logger.error('[ai] fallo en la respuesta', error)
    throw error
  } finally {
    if (inFlight === controller) inFlight = null
  }

  return {
    sources: describeSources(context),
    failures: [...context.failures],
    provider: provider.displayName,
    model,
  }
}
