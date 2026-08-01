import { AppError } from '../ipc/app-error'
import { logger } from '../lib/logger'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente HTTP de los proveedores
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todos los adaptadores pasan por aquí. Centralizarlo importa por tres motivos:
 *
 *  1. **Los errores se traducen una sola vez.** Un 429 es `RATE_LIMITED` y
 *     reintentable; un 401 es `MISSING_CREDENTIAL` y no lo es. Si cada adaptador
 *     lo decidiera por su cuenta, la interfaz recibiría códigos incoherentes
 *     según qué proveedor haya fallado.
 *  2. **Ningún proveedor puede colgar la aplicación.** Timeout obligatorio.
 *  3. **Las claves no acaban en los registros.** Van en la URL de casi todos los
 *     proveedores, así que se redactan antes de escribir nada.
 */

/** Un proveedor lento no debe dejar un panel girando indefinidamente. */
const DEFAULT_TIMEOUT_MS = 12_000

/**
 * Solo se reintenta lo que tiene sentido reintentar **dentro de la misma
 * petición**.
 *
 * 402 y 429 son reintentables a escala de minutos u horas, no de milisegundos:
 * se marcan como tales en el error para que la interfaz ofrezca reintentar,
 * pero no se repiten aquí — insistir contra una cuota agotada solo la agota más.
 */
const RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504])

export interface HttpRequest {
  readonly url: string
  /** Nombre del proveedor, para los mensajes de error y el registro. */
  readonly provider: string
  readonly headers?: Record<string, string>
  readonly timeoutMs?: number
  /** Reintentos ante fallo temporal. Cero para llamadas interactivas. */
  readonly retries?: number
}

/**
 * Oculta cualquier cosa con pinta de credencial antes de registrar una URL.
 *
 * La mayoría de proveedores financieros aceptan la clave como parámetro de
 * consulta, así que una URL sin redactar en el archivo de log es una fuga
 * permanente en el disco del usuario.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|key|apikey|api_key|secret|password/i.test(key)) {
        parsed.searchParams.set(key, '***')
      }
    }
    return parsed.toString()
  } catch {
    return '(url no analizable)'
  }
}

function mapStatus(status: number, provider: string, body: string): AppError {
  const detail = body.slice(0, 200).replace(/\s+/g, ' ')

  /**
   * 401 es lo único que significa de verdad «tu clave no vale».
   *
   * Antes 403 caía aquí también, y eso producía un mensaje falso: Finnhub
   * devuelve 403 cuando la clave es correcta pero **el plan no cubre ese dato**
   * («You don't have access to this resource»). Decirle a alguien que su
   * credencial es inválida cuando lo que pasa es que su plan no llega le hace
   * perder el tiempo comprobando una clave que está bien.
   */
  if (status === 401) {
    return new AppError('MISSING_CREDENTIAL', `${provider} rechazó la credencial.`, {
      details: detail,
      retryable: false,
    })
  }

  if (status === 403) {
    return new AppError(
      'PROVIDER_UNAVAILABLE',
      `El plan contratado en ${provider} no incluye este dato.`,
      { details: detail, retryable: false },
    )
  }

  /**
   * 402 «Pago requerido» es como FMP anuncia que se agotó la cuota diaria del
   * plan gratuito. Es una limitación temporal, no un fallo: mañana vuelve a
   * funcionar, así que se trata como cuota y se marca reintentable.
   */
  if (status === 402) {
    return new AppError('RATE_LIMITED', `${provider} ha agotado la cuota de su plan.`, {
      details: detail,
      retryable: true,
    })
  }

  if (status === 429) {
    return new AppError('RATE_LIMITED', `${provider} ha agotado la cuota.`, {
      details: detail,
      retryable: true,
    })
  }
  if (status === 404) {
    return new AppError('NOT_FOUND', `${provider} no tiene ese dato.`, {
      details: detail,
      retryable: false,
    })
  }
  if (status >= 500) {
    return new AppError('NETWORK_ERROR', `${provider} devolvió un error de servidor.`, {
      details: detail,
      retryable: true,
    })
  }
  return new AppError('NETWORK_ERROR', `${provider} respondió con HTTP ${status}.`, {
    details: detail,
    retryable: false,
  })
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Petición JSON con timeout, reintentos y errores tipados.
 *
 * No valida la forma de la respuesta: eso lo hace cada adaptador con su propio
 * esquema zod, porque la forma depende del proveedor.
 */
export async function fetchJson<T = unknown>(request: HttpRequest): Promise<T> {
  const { url, provider, headers, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = request

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const error = mapStatus(response.status, provider, body)

        // Solo se reintenta lo temporal, y nunca en el último intento.
        if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
          lastError = error
          await wait(400 * 2 ** attempt)
          continue
        }
        throw error
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof AppError) throw error

      // Timeout o fallo de red.
      const isTimeout = error instanceof Error && error.name === 'TimeoutError'
      lastError = error

      if (attempt < retries) {
        await wait(400 * 2 ** attempt)
        continue
      }

      logger.warn(
        `[http] ${provider} falló en ${redactUrl(url)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )

      throw new AppError(
        'NETWORK_ERROR',
        isTimeout
          ? `${provider} tardó demasiado en responder.`
          : `No se pudo contactar con ${provider}.`,
        { retryable: true, cause: error },
      )
    }
  }

  // Inalcanzable: el bucle sale por return o por throw.
  throw new AppError('NETWORK_ERROR', `No se pudo contactar con ${provider}.`, {
    retryable: true,
    cause: lastError,
  })
}
