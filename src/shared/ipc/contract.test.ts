import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, IPC_EVENT_NAMES, ipcContract, ipcEvents } from './contract'
import { PolarError, type IpcErrorPayload } from './errors'

describe('contrato IPC', () => {
  it('expone un canal por cada entrada del contrato', () => {
    expect([...IPC_CHANNELS].sort()).toEqual(Object.keys(ipcContract).sort())
    expect([...IPC_EVENT_NAMES].sort()).toEqual(Object.keys(ipcEvents).sort())
  })

  it('nombra los canales como dominio:acción', () => {
    for (const channel of IPC_CHANNELS) {
      expect(channel, `canal mal nombrado: ${channel}`).toMatch(/^[a-z]+:[a-zA-Z]+$/)
    }
  })

  it('define input y output para todos los canales', () => {
    for (const channel of IPC_CHANNELS) {
      expect(ipcContract[channel].input, channel).toBeDefined()
      expect(ipcContract[channel].output, channel).toBeDefined()
    }
  })
})

/**
 * Esta restricción es un control de seguridad, no una preferencia de estilo:
 * las noticias vienen de terceros y una URL `file://` incrustada podría
 * usarse para abrir algo del disco del usuario. Si alguien relaja el esquema,
 * esta prueba debe romperse.
 */
describe('app:openExternal — restricción de protocolo', () => {
  const schema = ipcContract['app:openExternal'].input

  it('acepta https', () => {
    expect(schema.safeParse({ url: 'https://example.com/noticia' }).success).toBe(true)
  })

  it.each([
    ['http://example.com', 'http sin cifrar'],
    ['file:///C:/Windows/System32/config/SAM', 'file, acceso al disco'],
    ['javascript:alert(1)', 'javascript, ejecución de código'],
    ['data:text/html,<script>alert(1)</script>', 'data, contenido embebido'],
    ['ftp://example.com', 'ftp'],
  ])('rechaza %s (%s)', (url) => {
    expect(schema.safeParse({ url }).success).toBe(false)
  })

  it('rechaza una entrada sin url', () => {
    expect(schema.safeParse({}).success).toBe(false)
  })
})

describe('canales sin entrada', () => {
  it('app:ping acepta undefined y solo devuelve "pong"', () => {
    expect(ipcContract['app:ping'].input.safeParse(undefined).success).toBe(true)
    expect(ipcContract['app:ping'].output.safeParse('pong').success).toBe(true)
    expect(ipcContract['app:ping'].output.safeParse('otra cosa').success).toBe(false)
  })
})

describe('PolarError', () => {
  it('conserva código y reintentabilidad al deshacer el sobre', () => {
    const payload: IpcErrorPayload = {
      code: 'RATE_LIMITED',
      message: 'Cuota agotada',
      details: 'finnhub: 60/min',
      retryable: true,
    }

    const error = new PolarError(payload)

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.retryable).toBe(true)
    expect(error.details).toBe('finnhub: 60/min')
    expect(error.message).toBe('Cuota agotada')
  })
})
