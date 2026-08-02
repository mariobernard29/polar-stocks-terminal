import { describe, expect, it } from 'vitest'
import {
  describeSources,
  extractSymbols,
  mentionsNews,
  mentionsPortfolio,
  serializeContext,
  type AiContext,
} from './context'

const emptyContext = (overrides: Partial<AiContext> = {}): AiContext => ({
  now: Date.UTC(2026, 7, 1, 12, 0, 0),
  marketSession: 'closed',
  quotes: [],
  profiles: [],
  news: [],
  positions: null,
  failures: [],
  ...overrides,
})

describe('extractSymbols', () => {
  it('encuentra un ticker suelto', () => {
    expect(extractSymbols('¿cómo va AAPL hoy?')).toEqual(['AAPL'])
  })

  it('encuentra varios y conserva el orden de aparición', () => {
    expect(extractSymbols('compara NVDA con AMD y MSFT')).toEqual(['NVDA', 'AMD', 'MSFT'])
  })

  it('reconoce los índices por su prefijo', () => {
    expect(extractSymbols('¿y el ^GSPC?')).toEqual(['^GSPC'])
  })

  it('descarta la jerga financiera que se escribe en mayúsculas', () => {
    // Sin la lista de exclusión, esto gastaría cuota buscando cotizaciones de
    // PER y de ETF, y metería dos fallos en el contexto que confundirían al
    // modelo sobre qué se le pidió.
    expect(extractSymbols('¿cuál es el PER de AAPL frente a otro ETF?')).toEqual(['AAPL'])
  })

  it('descarta divisas sueltas', () => {
    expect(extractSymbols('¿cuánto vale en USD?')).toEqual([])
  })

  it('ignora el texto en minúsculas', () => {
    expect(extractSymbols('¿qué tal va el mercado hoy?')).toEqual([])
  })

  it('admite tickers con punto o guion', () => {
    expect(extractSymbols('¿y BRK.B?')).toEqual(['BRK.B'])
  })

  it('los símbolos explícitos van primero y no se duplican', () => {
    // El activo abierto en la aplicación no es una suposición: es lo que el
    // usuario está mirando mientras escribe.
    expect(extractSymbols('¿y comparado con MSFT?', ['AAPL'])).toEqual(['AAPL', 'MSFT'])
    expect(extractSymbols('¿cómo va AAPL?', ['AAPL'])).toEqual(['AAPL'])
  })

  it('respeta el límite', () => {
    expect(extractSymbols('AAPL MSFT NVDA AMD INTC TSLA', [], 3)).toHaveLength(3)
  })

  it('no repite el mismo símbolo', () => {
    expect(extractSymbols('AAPL sube, AAPL baja, AAPL')).toEqual(['AAPL'])
  })
})

describe('mentionsPortfolio', () => {
  it('detecta las formas habituales', () => {
    expect(mentionsPortfolio('¿cómo va mi cartera?')).toBe(true)
    expect(mentionsPortfolio('resume mi portafolio')).toBe(true)
    expect(mentionsPortfolio('how is my portfolio doing')).toBe(true)
  })

  it('no se activa con cualquier pregunta', () => {
    expect(mentionsPortfolio('¿cuánto vale AAPL?')).toBe(false)
  })
})

describe('mentionsNews', () => {
  it('detecta preguntas sobre noticias y sobre causas', () => {
    expect(mentionsNews('¿alguna noticia de NVDA?')).toBe(true)
    expect(mentionsNews('¿por qué baja TSLA?')).toBe(true)
    expect(mentionsNews('what happened to AMD')).toBe(true)
  })

  it('no se activa con una pregunta de precio', () => {
    expect(mentionsNews('¿a cuánto cotiza AAPL?')).toBe(false)
  })
})

describe('serializeContext', () => {
  it('dice explícitamente cuando no hay datos', () => {
    // Importa: si el bloque llegara vacío sin decirlo, el modelo tendería a
    // rellenar el hueco con lo que recuerde de su entrenamiento.
    const text = serializeContext(emptyContext())

    expect(text).toContain('No se recopiló ningún dato')
    expect(text).toContain('=== DATOS ===')
    expect(text).toContain('=== FIN DE DATOS ===')
  })

  it('cada cotización lleva su fuente y su marca de tiempo', () => {
    const text = serializeContext(
      emptyContext({
        quotes: [
          {
            symbol: 'AAPL',
            price: 308.91,
            change: 2.5,
            changePercent: 0.82,
            currency: 'USD',
            previousClose: 306.41,
            dayHigh: 310,
            dayLow: 305,
            source: 'finnhub',
            at: Date.UTC(2026, 7, 1, 11, 59, 0),
          },
        ],
      }),
    )

    expect(text).toContain('AAPL:')
    expect(text).toContain('308.91')
    expect(text).toContain('fuente=finnhub')
    expect(text).toContain('2026-08-01T11:59:00.000Z')
  })

  it('incluye los fallos para que el modelo pueda mencionarlos', () => {
    const text = serializeContext(
      emptyContext({ failures: ['No se pudo obtener la cotización de XYZ'] }),
    )

    expect(text).toContain('No disponible')
    expect(text).toContain('XYZ')
  })

  it('avisa de que la cartera no trae valor de mercado', () => {
    // El repositorio devuelve coste y realizado, nunca precio. Sin esta nota, el
    // modelo podría presentar el coste como si fuera el valor actual.
    const text = serializeContext(
      emptyContext({
        positions: [
          {
            symbol: 'AAPL',
            quantity: 15,
            averageCost: 150.25,
            costBasis: 2253.75,
            realizedPnl: 748.75,
          },
        ],
      }),
    )

    expect(text).toContain('Cartera del usuario')
    expect(text).toContain('coste_medio=150.25')
    expect(text).toContain('NO están aquí')
  })

  it('distingue una cartera vacía de no haber preguntado por ella', () => {
    expect(serializeContext(emptyContext({ positions: [] }))).toContain(
      'sin posiciones registradas',
    )
    expect(serializeContext(emptyContext({ positions: null }))).not.toContain(
      'Cartera del usuario',
    )
  })
})

describe('describeSources', () => {
  it('enumera lo que se usó para que el usuario pueda comprobarlo', () => {
    const sources = describeSources(
      emptyContext({
        quotes: [
          {
            symbol: 'AAPL',
            price: 1,
            change: 0,
            changePercent: 0,
            currency: 'USD',
            previousClose: null,
            dayHigh: null,
            dayLow: null,
            source: 'finnhub',
            at: 0,
          },
        ],
        news: [{ headline: 'x', source: 'y', publishedAt: 0, symbols: [] }],
        positions: [],
      }),
    )

    expect(sources).toEqual([
      'Cotización de AAPL (finnhub)',
      '1 titulares',
      'Cartera (0 posiciones)',
    ])
  })

  it('sin datos no enumera nada', () => {
    expect(describeSources(emptyContext())).toEqual([])
  })
})
