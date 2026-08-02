import { AppError } from '../ipc/app-error'
import { aiHttpError, parseEventData, readEventStream } from './sse'
import type { AiProvider, AiRequest } from './types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Adaptadores de IA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Los tres hablan SSE, pero cada uno con su propia forma dentro y su propia
 * manera de recibir la clave y las instrucciones del sistema:
 *
 * | | Clave | Sistema |
 * |---|---|---|
 * | Anthropic | cabecera `x-api-key` | campo `system` propio |
 * | OpenAI | `Authorization: Bearer` | mensaje con rol `system` |
 * | Gemini | cabecera `x-goog-api-key` | campo `systemInstruction` |
 *
 * Las diferencias se quedan aquí. Hacia arriba, los tres son la misma cosa.
 */

/** Un `fetch` con el aborto del usuario ya conectado. */
async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
  provider: string,
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    // Abortar es una acción del usuario, no un fallo de red: no debe pintarse
    // en rojo como si algo hubiera ido mal.
    if (signal.aborted) throw new AppError('CANCELLED', 'Petición cancelada.')
    throw new AppError('NETWORK_ERROR', `No se pudo contactar con ${provider}.`, {
      cause: error,
      retryable: true,
    })
  }

  if (!response.ok) {
    throw aiHttpError(response.status, await response.text().catch(() => ''), provider)
  }

  return response
}

/** Lee una propiedad anidada sin confiar en la forma de la respuesta. */
function pick(value: unknown, ...path: (string | number)[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  return current
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

export function createAnthropicProvider(): AiProvider {
  return {
    id: 'anthropic',
    displayName: 'Anthropic (Claude)',
    defaultModel: 'claude-opus-5',
    knownModels: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    docsUrl: 'https://console.anthropic.com/settings/keys',

    async stream(request: AiRequest, onDelta): Promise<void> {
      const response = await post(
        'https://api.anthropic.com/v1/messages',
        {
          'x-api-key': request.apiKey,
          'anthropic-version': '2023-06-01',
        },
        {
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
          stream: true,
        },
        request.signal,
        'Anthropic',
      )

      await readEventStream(response, (data) => {
        const event = parseEventData(data)
        if (!event) return

        const type = pick(event, 'type')

        if (type === 'content_block_delta') {
          const text = pick(event, 'delta', 'text')
          if (typeof text === 'string') onDelta(text)
          return
        }

        // Un error a mitad de flujo llega como evento, no como estado HTTP: la
        // cabecera ya se envió con 200 antes de que fallara nada.
        if (type === 'error') {
          const message = pick(event, 'error', 'message')
          throw new AppError(
            'PROVIDER_UNAVAILABLE',
            typeof message === 'string' ? message : 'Anthropic interrumpió la respuesta.',
          )
        }

        if (type === 'message_stop') return false
      })
    },
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

export function createOpenAiProvider(): AiProvider {
  return {
    id: 'openai',
    displayName: 'OpenAI',
    defaultModel: 'gpt-4.1',
    knownModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    docsUrl: 'https://platform.openai.com/api-keys',

    async stream(request: AiRequest, onDelta): Promise<void> {
      const response = await post(
        'https://api.openai.com/v1/chat/completions',
        { authorization: `Bearer ${request.apiKey}` },
        {
          model: request.model,
          max_tokens: request.maxTokens,
          stream: true,
          // Aquí el sistema es un mensaje más, el primero de la lista.
          messages: [{ role: 'system', content: request.system }, ...request.messages],
        },
        request.signal,
        'OpenAI',
      )

      await readEventStream(response, (data) => {
        // OpenAI cierra con un `[DONE]` literal que no es JSON.
        if (data === '[DONE]') return false

        const event = parseEventData(data)
        if (!event) return

        const text = pick(event, 'choices', 0, 'delta', 'content')
        if (typeof text === 'string') onDelta(text)
      })
    },
  }
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

export function createGeminiProvider(): AiProvider {
  return {
    id: 'gemini',
    displayName: 'Google Gemini',
    /*
     * Alias `-latest` y no una versión concreta.
     *
     * Comprobado contra la API: `gemini-2.5-flash` ya devuelve 404 con el texto
     * «no longer available to new users». Una lista de versiones fijas se pudre
     * sola y obliga a publicar la aplicación para poder usar un modelo que ya
     * existe; el alias sigue funcionando.
     *
     * Y `flash` y no `pro` por defecto: `gemini-pro-latest` responde 429 en el
     * plan gratuito, que es el que usa quien prueba esto por primera vez. Un
     * primer intento fallido por elegir mal el defecto es un mal recibimiento.
     */
    defaultModel: 'gemini-flash-latest',
    knownModels: ['gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest'],
    docsUrl: 'https://aistudio.google.com/app/apikey',

    async stream(request: AiRequest, onDelta): Promise<void> {
      // El modelo va en la ruta, y `alt=sse` es lo que hace que responda como
      // flujo de eventos en vez de como un array JSON gigante.
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`

      const response = await post(
        url,
        { 'x-goog-api-key': request.apiKey },
        {
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map((message) => ({
            // Gemini llama «model» a lo que los otros dos llaman «assistant».
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: request.maxTokens },
        },
        request.signal,
        'Gemini',
      )

      await readEventStream(response, (data) => {
        const event = parseEventData(data)
        if (!event) return

        const parts = pick(event, 'candidates', 0, 'content', 'parts')
        if (!Array.isArray(parts)) return

        for (const part of parts) {
          const text = pick(part, 'text')
          if (typeof text === 'string') onDelta(text)
        }
      })
    },
  }
}
