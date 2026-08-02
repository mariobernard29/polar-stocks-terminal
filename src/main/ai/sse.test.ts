import { describe, expect, it } from 'vitest'
import { parseEventData, readEventStream } from './sse'

/**
 * Pruebas del lector SSE.
 *
 * Existen por un fallo real: Gemini separa sus eventos con `\r\n\r\n` y el
 * lector solo buscaba `\n\n`. La petición terminaba con éxito, sin errores y sin
 * una sola palabra de respuesta. Cubrir esto con pruebas es barato; volver a
 * diagnosticarlo, no.
 */

/** Construye una `Response` que entrega los trozos indicados, en ese orden. */
function streamOf(...chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
  )
}

async function collect(...chunks: string[]): Promise<string[]> {
  const seen: string[] = []
  await readEventStream(streamOf(...chunks), (data) => {
    seen.push(data)
  })
  return seen
}

describe('readEventStream', () => {
  it('lee eventos separados por salto de línea simple', async () => {
    expect(await collect('data: uno\n\ndata: dos\n\n')).toEqual(['uno', 'dos'])
  })

  it('lee eventos separados por CRLF', async () => {
    // El caso de Gemini. Sin esto no se emite absolutamente nada.
    expect(await collect('data: uno\r\n\r\ndata: dos\r\n\r\n')).toEqual(['uno', 'dos'])
  })

  it('lee eventos separados por CR solo', async () => {
    expect(await collect('data: uno\r\rdata: dos\r\r')).toEqual(['uno', 'dos'])
  })

  it('reensambla un evento partido entre dos trozos de red', async () => {
    // Un trozo de red no coincide con un evento. Sin búfer, el `JSON.parse`
    // falla de forma intermitente y solo con respuestas largas.
    expect(await collect('data: {"a"', ':1}\n\n')).toEqual(['{"a":1}'])
  })

  it('no parte un evento cuando el CR y el LF caen en trozos distintos', async () => {
    // Si cada trozo se normalizara por su cuenta, el `\r` final se convertiría
    // en `\n` y con el `\n` siguiente formaría un separador falso: el evento se
    // cortaría por la mitad y su JSON quedaría inválido.
    expect(await collect('data: {"a":1}\r', '\ndata: {"b":2}\r\n\r\n')).toEqual([
      '{"a":1}\n{"b":2}',
    ])
  })

  it('procesa varios eventos que llegan en el mismo trozo', async () => {
    expect(await collect('data: uno\n\ndata: dos\n\ndata: tres\n\n')).toEqual([
      'uno',
      'dos',
      'tres',
    ])
  })

  it('une varias líneas data de un mismo evento', async () => {
    expect(await collect('data: uno\ndata: dos\n\n')).toEqual(['uno\ndos'])
  })

  it('ignora comentarios y líneas de control', async () => {
    // Los latidos llegan como `: ping` y no son datos.
    expect(await collect(': ping\n\ndata: uno\n\nevent: fin\n\n')).toEqual(['uno'])
  })

  it('se detiene cuando el consumidor devuelve false', async () => {
    const seen: string[] = []
    await readEventStream(streamOf('data: uno\n\ndata: dos\n\ndata: tres\n\n'), (data) => {
      seen.push(data)
      return data !== 'dos'
    })

    expect(seen).toEqual(['uno', 'dos'])
  })

  it('descarta un evento final sin línea en blanco de cierre', async () => {
    // Sin separador el evento está incompleto: emitirlo sería adivinar que ya
    // no viene nada más.
    expect(await collect('data: uno\n\ndata: incompl')).toEqual(['uno'])
  })

  it('decodifica caracteres multibyte partidos entre trozos', async () => {
    const bytes = new TextEncoder().encode('data: café\n\n')
    const encoder = new TextDecoder()
    void encoder

    // El byte 8 cae en mitad de la «é».
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 9))
          controller.enqueue(bytes.slice(9))
          controller.close()
        },
      }),
    )

    const seen: string[] = []
    await readEventStream(response, (data) => {
      seen.push(data)
    })

    expect(seen).toEqual(['café'])
  })
})

describe('parseEventData', () => {
  it('devuelve el objeto de un JSON válido', () => {
    expect(parseEventData('{"a":1}')).toEqual({ a: 1 })
  })

  it('trata [DONE] como fin, no como dato', () => {
    expect(parseEventData('[DONE]')).toBeNull()
  })

  it('no lanza con un evento que no es JSON', () => {
    // Los proveedores intercalan control y latidos. Que uno de ellos tumbe la
    // respuesta entera sería absurdo.
    expect(parseEventData('ping')).toBeNull()
  })
})
