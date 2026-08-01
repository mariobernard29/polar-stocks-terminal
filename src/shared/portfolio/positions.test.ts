import { describe, expect, it } from 'vitest'
import {
  derivePosition,
  derivePositions,
  summarize,
  withMarketValue,
  type PortfolioTransaction,
} from './positions'

/**
 * Pruebas del cálculo de posiciones.
 *
 * Las cifras esperadas están calculadas a mano en los comentarios. Es la única
 * forma de que estas pruebas sirvan: si se derivaran con el mismo código que se
 * prueba, confirmarían que el código hace lo que hace, no que hace lo correcto.
 */

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 5)

function buy(
  quantity: number,
  pricePerUnit: number,
  options: { fees?: number; day?: number; symbol?: string } = {},
): PortfolioTransaction {
  return {
    symbol: options.symbol ?? 'AAPL',
    side: 'buy',
    quantity,
    pricePerUnit,
    fees: options.fees ?? 0,
    executedAt: T0 + (options.day ?? 0) * DAY,
  }
}

function sell(
  quantity: number,
  pricePerUnit: number,
  options: { fees?: number; day?: number; symbol?: string } = {},
): PortfolioTransaction {
  return { ...buy(quantity, pricePerUnit, options), side: 'sell' }
}

describe('derivePosition', () => {
  it('sin transacciones deja la posición a cero', () => {
    const position = derivePosition('AAPL', [])

    expect(position.quantity).toBe(0)
    expect(position.averageCost).toBe(0)
    expect(position.realizedPnl).toBe(0)
  })

  it('una compra simple fija el coste medio en el precio pagado', () => {
    const position = derivePosition('AAPL', [buy(10, 150)])

    expect(position.quantity).toBe(10)
    expect(position.averageCost).toBe(150)
    expect(position.costBasis).toBe(1500)
  })

  it('las comisiones de compra aumentan el coste medio', () => {
    // 10 × 150 + 9,95 = 1509,95 → 150,995 por acción.
    const position = derivePosition('AAPL', [buy(10, 150, { fees: 9.95 })])

    expect(position.costBasis).toBeCloseTo(1509.95, 10)
    expect(position.averageCost).toBeCloseTo(150.995, 10)
  })

  it('promedia dos compras a precios distintos ponderando por cantidad', () => {
    // 10 × 100 = 1000, 30 × 200 = 6000 → 7000 / 40 = 175.
    // Ponderado, no la media aritmética de 100 y 200, que sería 150.
    const position = derivePosition('AAPL', [buy(10, 100), buy(30, 200, { day: 1 })])

    expect(position.quantity).toBe(40)
    expect(position.averageCost).toBeCloseTo(175, 10)
  })

  it('ordena cronológicamente aunque lleguen desordenadas', () => {
    const chronological = derivePosition('AAPL', [buy(10, 100), sell(5, 120, { day: 1 })])
    const shuffled = derivePosition('AAPL', [sell(5, 120, { day: 1 }), buy(10, 100)])

    expect(shuffled).toEqual(chronological)
  })

  it('una venta parcial materializa la ganancia y no altera el coste medio', () => {
    // Compra 10 @ 100 → coste medio 100. Vende 4 @ 150.
    // Realizado = 4 × 150 − 4 × 100 = 200. Quedan 6 con coste base 600.
    const position = derivePosition('AAPL', [buy(10, 100), sell(4, 150, { day: 1 })])

    expect(position.quantity).toBe(6)
    expect(position.averageCost).toBeCloseTo(100, 10)
    expect(position.costBasis).toBeCloseTo(600, 10)
    expect(position.realizedPnl).toBeCloseTo(200, 10)
    expect(position.soldQuantity).toBe(4)
  })

  it('una venta con pérdida da un resultado realizado negativo', () => {
    // 10 @ 100, vende 10 @ 80 → −200.
    const position = derivePosition('AAPL', [buy(10, 100), sell(10, 80, { day: 1 })])

    expect(position.realizedPnl).toBeCloseTo(-200, 10)
    expect(position.quantity).toBe(0)
  })

  it('las comisiones de venta reducen los ingresos', () => {
    // 4 × 150 − 9,95 = 590,05 de ingresos; coste de lo vendido 400 → 190,05.
    const position = derivePosition('AAPL', [buy(10, 100), sell(4, 150, { day: 1, fees: 9.95 })])

    expect(position.realizedPnl).toBeCloseTo(190.05, 10)
  })

  it('cerrar del todo deja cantidad y coste base exactamente a cero', () => {
    // Sin la limpieza del residuo, 0,1 + 0,2 − 0,3 dejaría 5,5e-17 unidades y un
    // coste medio calculado sobre ese resto.
    const position = derivePosition('BTC', [
      buy(0.1, 50_000),
      buy(0.2, 60_000, { day: 1 }),
      sell(0.3, 70_000, { day: 2 }),
    ])

    expect(position.quantity).toBe(0)
    expect(position.costBasis).toBe(0)
    expect(position.averageCost).toBe(0)
  })

  it('recomprar después de cerrar parte de un coste medio nuevo', () => {
    // Cierra a 100, luego compra 5 @ 300. El coste medio debe ser 300, no una
    // mezcla con la posición anterior, que ya no existe.
    const position = derivePosition('AAPL', [
      buy(10, 100),
      sell(10, 120, { day: 1 }),
      buy(5, 300, { day: 2 }),
    ])

    expect(position.quantity).toBe(5)
    expect(position.averageCost).toBeCloseTo(300, 10)
    expect(position.realizedPnl).toBeCloseTo(200, 10)
  })

  it('vender más de lo que se tiene liquida solo lo disponible', () => {
    // Tiene 10, la venta dice 15: se venden 10. Una posición de −5 acciones
    // sería un corto que no se ha abierto.
    const position = derivePosition('AAPL', [buy(10, 100), sell(15, 120, { day: 1 })])

    expect(position.quantity).toBe(0)
    expect(position.soldQuantity).toBe(10)
    expect(position.realizedPnl).toBeCloseTo(200, 10)
  })

  it('ignora una venta sin posición abierta', () => {
    const position = derivePosition('AAPL', [sell(10, 120)])

    expect(position.quantity).toBe(0)
    expect(position.realizedPnl).toBe(0)
    expect(position.soldQuantity).toBe(0)
  })

  it('ignora transacciones de cantidad cero o negativa', () => {
    const position = derivePosition('AAPL', [buy(10, 100), buy(0, 999, { day: 1 })])

    expect(position.quantity).toBe(10)
    expect(position.averageCost).toBeCloseTo(100, 10)
  })

  it('maneja fracciones de acción', () => {
    // 0,5 × 400 + 1,25 × 480 = 200 + 600 = 800 sobre 1,75 → 457,142857…
    const position = derivePosition('AAPL', [buy(0.5, 400), buy(1.25, 480, { day: 1 })])

    expect(position.quantity).toBeCloseTo(1.75, 10)
    expect(position.averageCost).toBeCloseTo(800 / 1.75, 10)
  })

  it('el coste medio no cambia al vender, solo el coste base', () => {
    // Propiedad del método de coste medio: vender no reprecia lo que queda.
    const before = derivePosition('AAPL', [buy(10, 100), buy(10, 200, { day: 1 })])
    const after = derivePosition('AAPL', [
      buy(10, 100),
      buy(10, 200, { day: 1 }),
      sell(7, 500, { day: 2 }),
    ])

    expect(after.averageCost).toBeCloseTo(before.averageCost, 10)
    expect(after.costBasis).toBeCloseTo(before.averageCost * 13, 10)
  })
})

describe('derivePositions', () => {
  it('separa por símbolo y normaliza a mayúsculas', () => {
    const positions = derivePositions([
      buy(10, 100, { symbol: 'AAPL' }),
      buy(2, 300, { symbol: 'msft' }),
      buy(5, 120, { symbol: 'aapl', day: 1 }),
    ])

    const bySymbol = new Map(positions.map((position) => [position.symbol, position]))

    expect([...bySymbol.keys()].sort()).toEqual(['AAPL', 'MSFT'])
    // Las dos entradas de AAPL se fusionan: 1000 + 600 = 1600 sobre 15.
    expect(bySymbol.get('AAPL')?.quantity).toBe(15)
    expect(bySymbol.get('AAPL')?.averageCost).toBeCloseTo(1600 / 15, 10)
  })
})

describe('withMarketValue', () => {
  it('calcula la plusvalía latente sobre el coste base', () => {
    const position = derivePosition('AAPL', [buy(10, 100)])
    const withMarket = withMarketValue(position, 150)

    expect(withMarket.marketValue).toBeCloseTo(1500, 10)
    expect(withMarket.unrealizedPnl).toBeCloseTo(500, 10)
    expect(withMarket.unrealizedPnlPercent).toBeCloseTo(50, 10)
  })

  it('sin precio no inventa un valor de mercado', () => {
    const position = derivePosition('AAPL', [buy(10, 100)])
    const withMarket = withMarketValue(position, null)

    expect(withMarket.marketValue).toBeNull()
    expect(withMarket.unrealizedPnl).toBeNull()
    expect(withMarket.unrealizedPnlPercent).toBeNull()
  })

  it('una posición cerrada no tiene plusvalía latente', () => {
    const position = derivePosition('AAPL', [buy(10, 100), sell(10, 150, { day: 1 })])
    const withMarket = withMarketValue(position, 200)

    expect(withMarket.marketValue).toBe(0)
    expect(withMarket.unrealizedPnl).toBeNull()
    expect(withMarket.realizedPnl).toBeCloseTo(500, 10)
  })
})

describe('summarize', () => {
  it('suma valor, coste y resultados de todas las posiciones', () => {
    const positions = [
      // 10 @ 100 → coste 1000, ahora a 150 → valor 1500, latente +500.
      withMarketValue(derivePosition('AAPL', [buy(10, 100)]), 150),
      // 5 @ 200 → coste 1000, ahora a 180 → valor 900, latente −100.
      withMarketValue(derivePosition('MSFT', [buy(5, 200, { symbol: 'MSFT' })]), 180),
    ]

    const summary = summarize(positions, 42)

    expect(summary.marketValue).toBeCloseTo(2400, 10)
    expect(summary.costBasis).toBeCloseTo(2000, 10)
    expect(summary.unrealizedPnl).toBeCloseTo(400, 10)
    expect(summary.unrealizedPnlPercent).toBeCloseTo(20, 10)
    expect(summary.dividends).toBe(42)
    expect(summary.totalPnl).toBeCloseTo(442, 10)
    expect(summary.openPositions).toBe(2)
    expect(summary.hasMissingPrices).toBe(false)
  })

  it('las posiciones cerradas aportan su resultado realizado pero no cuentan como abiertas', () => {
    const closed = withMarketValue(
      derivePosition('AAPL', [buy(10, 100), sell(10, 150, { day: 1 })]),
      150,
    )

    const summary = summarize([closed])

    expect(summary.openPositions).toBe(0)
    expect(summary.marketValue).toBe(0)
    expect(summary.realizedPnl).toBeCloseTo(500, 10)
    expect(summary.totalPnl).toBeCloseTo(500, 10)
  })

  it('avisa cuando falta algún precio en lugar de contarlo como cero', () => {
    const positions = [
      withMarketValue(derivePosition('AAPL', [buy(10, 100)]), 150),
      withMarketValue(derivePosition('XYZ', [buy(5, 200, { symbol: 'XYZ' })]), null),
    ]

    const summary = summarize(positions)

    expect(summary.hasMissingPrices).toBe(true)
    // El coste sí se conoce, así que se suma; el valor de mercado queda corto y
    // por eso la interfaz debe advertirlo.
    expect(summary.costBasis).toBeCloseTo(2000, 10)
    expect(summary.marketValue).toBeCloseTo(1500, 10)
  })

  it('un portafolio vacío no divide por cero', () => {
    const summary = summarize([])

    expect(summary.marketValue).toBe(0)
    expect(summary.unrealizedPnlPercent).toBeNull()
    expect(summary.totalPnl).toBe(0)
  })
})
