import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJson, redactUrl } from './http'

/**
 * El mapeo de códigos HTTP decide qué mensaje ve el usuario cuando algo falla.
 * Equivocarlo no rompe nada visible en desarrollo, pero hace perder el tiempo a
 * quien lo sufre: decirle «tu clave no vale» a alguien cuya clave está bien y
 * lo que pasa es que su plan no cubre ese dato.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

function mockResponse(status: number, body = '{}'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  )
}

const request = { url: 'https://api.ejemplo.com/quote?token=secreta', provider: 'Ejemplo' }

describe('mapeo de estados HTTP', () => {
  it('401 es lo único que significa credencial inválida', async () => {
    mockResponse(401)
    await expect(fetchJson({ ...request, retries: 0 })).rejects.toMatchObject({
      code: 'MISSING_CREDENTIAL',
      retryable: false,
    })
  })

  /**
   * Regresión: 403 caía en MISSING_CREDENTIAL. Finnhub lo devuelve cuando la
   * clave es correcta pero el plan no cubre el endpoint («You don't have access
   * to this resource»), y el mensaje resultante era falso.
   */
  it('403 es una limitación del plan, no una credencial inválida', async () => {
    mockResponse(403, '{"error":"You don\'t have access to this resource."}')
    const error = await fetchJson({ ...request, retries: 0 }).catch((e: unknown) => e)

    expect(error).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: false })
    expect((error as Error).message).toMatch(/plan/i)
    expect((error as Error).message).not.toMatch(/credencial/i)
  })

  /** Regresión: FMP anuncia la cuota diaria agotada con 402, no con 429. */
  it('402 se trata como cuota agotada y es reintentable más tarde', async () => {
    mockResponse(402)
    await expect(fetchJson({ ...request, retries: 0 })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    })
  })

  it('429 es cuota agotada', async () => {
    mockResponse(429)
    await expect(fetchJson({ ...request, retries: 0 })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    })
  })

  it('404 es dato ausente, no error de red', async () => {
    mockResponse(404)
    await expect(fetchJson({ ...request, retries: 0 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      retryable: false,
    })
  })

  it('500 es fallo del servidor y sí se reintenta', async () => {
    mockResponse(500)
    await expect(fetchJson({ ...request, retries: 0 })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    })
  })

  /**
   * Insistir contra una cuota agotada solo la agota más. El error se marca
   * reintentable para que la interfaz ofrezca el botón, pero el cliente no
   * repite la llamada por su cuenta.
   */
  it('no reintenta automáticamente ante una cuota agotada', async () => {
    mockResponse(429)
    const spy = globalThis.fetch as ReturnType<typeof vi.fn>

    await fetchJson({ ...request, retries: 3 }).catch(() => undefined)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('sí reintenta ante un fallo temporal del servidor', async () => {
    mockResponse(503)
    const spy = globalThis.fetch as ReturnType<typeof vi.fn>

    await fetchJson({ ...request, retries: 2 }).catch(() => undefined)

    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('devuelve el JSON cuando la respuesta es correcta', async () => {
    mockResponse(200, '{"precio":123}')
    await expect(fetchJson({ ...request, retries: 0 })).resolves.toEqual({ precio: 123 })
  })
})

/**
 * Casi todos los proveedores financieros aceptan la clave como parámetro de
 * consulta. Una URL sin redactar en el archivo de registro es una fuga
 * permanente en el disco del usuario.
 */
describe('redactUrl', () => {
  it('oculta cualquier parámetro con pinta de credencial', () => {
    expect(redactUrl('https://x.com/a?token=abc123')).toContain('token=***')
    expect(redactUrl('https://x.com/a?apiKey=abc123')).toContain('apiKey=***')
    expect(redactUrl('https://x.com/a?apikey=abc123')).toContain('apikey=***')
    expect(redactUrl('https://x.com/a?api_key=abc123')).toContain('api_key=***')
    expect(redactUrl('https://x.com/a?secret=abc123')).toContain('secret=***')
  })

  it('no oculta el resto de parámetros, que sirven para diagnosticar', () => {
    const result = redactUrl('https://x.com/quote?symbol=AAPL&token=abc123')
    expect(result).toContain('symbol=AAPL')
    expect(result).not.toContain('abc123')
  })

  it('no deja escapar la clave ni con una URL malformada', () => {
    expect(redactUrl('no-es-una-url?token=secreta')).not.toContain('secreta')
  })
})
