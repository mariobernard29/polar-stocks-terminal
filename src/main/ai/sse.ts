import { AppError } from '../ipc/app-error'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Lectura de flujos SSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Los tres proveedores usan el mismo transporte —`text/event-stream`— con
 * formas distintas dentro. Esta capa se ocupa del transporte; cada adaptador
 * interpreta su propio JSON.
 *
 * El detalle que hay que acertar: un `chunk` de red **no coincide** con una
 * línea. Un evento puede partirse entre dos lecturas y dos eventos pueden venir
 * en la misma. Sin el búfer de abajo, el `JSON.parse` falla de forma
 * intermitente y solo con respuestas largas, que es la peor manera posible de
 * que falle.
 */

/** Traduce el estado HTTP a un error que la interfaz sepa explicar. */
export function aiHttpError(status: number, body: string, provider: string): AppError {
  // El cuerpo puede contener el eco de la petición, y la petición contiene los
  // datos de mercado del usuario. Se recorta a lo justo para diagnosticar.
  const detail = body.slice(0, 300)

  if (status === 401 || status === 403) {
    return new AppError(
      'MISSING_CREDENTIAL',
      `La clave de ${provider} no es válida o no tiene permiso.`,
      { retryable: false },
    )
  }
  if (status === 429) {
    return new AppError('RATE_LIMITED', `${provider} ha limitado las peticiones.`, {
      retryable: true,
    })
  }
  if (status === 400) {
    return new AppError('CONTRACT_VIOLATION', `${provider} rechazó la petición: ${detail}`, {
      retryable: false,
    })
  }
  if (status >= 500) {
    return new AppError('PROVIDER_UNAVAILABLE', `${provider} no está disponible ahora mismo.`, {
      retryable: true,
    })
  }

  return new AppError('NETWORK_ERROR', `${provider} respondió ${status}: ${detail}`, {
    retryable: false,
  })
}

/**
 * Fin de evento: una línea en blanco, en cualquiera de sus tres formas.
 *
 * La especificación de SSE admite `\n`, `\r\n` y `\r` como fin de línea, y
 * **Gemini usa `\r\n`**. Buscando solo `\n\n` no se encuentra jamás el final de
 * un evento: el búfer crece sin parar, no se emite un solo trozo y la petición
 * termina con éxito y sin texto. Es un fallo silencioso que además no se ve en
 * un volcado de la respuesta, porque el `\r` es invisible.
 *
 * Se busca con un patrón en lugar de normalizar el trozo entrante porque un
 * trozo puede acabar en `\r` y el siguiente empezar por `\n`: normalizarlos por
 * separado convertiría un único fin de línea en un separador falso, partiendo un
 * evento por la mitad.
 */
const EVENT_SEPARATOR = /\r\n\r\n|\n\n|\r\r/

/** Une las líneas `data:` de un evento, como manda la especificación. */
function extractData(rawEvent: string): string {
  return rawEvent
    .split(/\r\n|\n|\r/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
}

/**
 * Recorre un flujo SSE y entrega cada bloque `data:` ya reensamblado.
 *
 * `onData` recibe el contenido en crudo; devolver `false` detiene la lectura,
 * que es como los adaptadores tratan el evento de fin de cada proveedor.
 */
export async function readEventStream(
  response: Response,
  onData: (data: string) => boolean | void,
): Promise<void> {
  const body = response.body
  if (!body) throw new AppError('NETWORK_ERROR', 'La respuesta no traía cuerpo.')

  const decoder = new TextDecoder()
  let buffer = ''

  const reader = body.getReader()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      // `stream: true` es imprescindible: un carácter multibyte puede quedar
      // partido entre dos lecturas, y sin esto se decodificaría como basura.
      buffer += decoder.decode(value, { stream: true })

      // Los eventos se separan por línea en blanco. Se procesa solo lo que está
      // completo y el resto se queda en el búfer para la vuelta siguiente.
      for (;;) {
        const match = EVENT_SEPARATOR.exec(buffer)
        if (!match) break

        const rawEvent = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)

        const data = extractData(rawEvent)
        if (data !== '' && onData(data) === false) return
      }
    }
  } finally {
    // Cancelar en lugar de solo soltar la referencia: si el usuario abortó, hay
    // que cerrar el socket de verdad y no dejar la petición viva pagándose.
    reader.cancel().catch(() => {})
  }
}

/**
 * `JSON.parse` que no tumba el flujo.
 *
 * Los proveedores intercalan eventos de control (`[DONE]`, comentarios,
 * latidos) que no son JSON. Que uno de ellos aborte la respuesta entera sería
 * absurdo.
 */
export function parseEventData(data: string): unknown | null {
  if (data === '[DONE]') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}
