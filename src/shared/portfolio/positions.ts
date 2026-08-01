/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Cálculo de posiciones
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Las posiciones **no se almacenan**: se derivan de las transacciones cada vez.
 * Guardar ambas cosas invita a que se desincronicen, y el historial de
 * movimientos es la única fuente de verdad para el coste medio.
 *
 * Método de coste medio ponderado, que es el que muestran casi todos los
 * brókers minoristas y el que la mayoría de la gente espera ver. No es el único
 * válido —FIFO y lote específico dan cifras distintas y pueden importar a
 * efectos fiscales—, así que conviene que quede escrito cuál se usa.
 *
 * Módulo puro: sin base de datos, sin red. Es la parte del proyecto donde un
 * error se traduce en que alguien vea mal cuánto ha ganado.
 */

export interface PortfolioTransaction {
  readonly symbol: string
  readonly side: 'buy' | 'sell'
  readonly quantity: number
  readonly pricePerUnit: number
  /** Comisiones e impuestos de la operación. */
  readonly fees: number
  /** Epoch ms. El orden cronológico determina el coste medio. */
  readonly executedAt: number
}

export interface Position {
  readonly symbol: string
  /** Unidades en cartera. Cero significa posición cerrada. */
  readonly quantity: number
  /** Coste medio por unidad, comisiones de compra incluidas. */
  readonly averageCost: number
  /** Dinero invertido que sigue en la posición. */
  readonly costBasis: number
  /** Beneficio o pérdida ya materializado por las ventas. */
  readonly realizedPnl: number
  /** Cuántas unidades se han vendido en total. */
  readonly soldQuantity: number
}

export interface PositionWithMarket extends Position {
  /** Precio actual. `null` si no se pudo obtener. */
  readonly price: number | null
  /** Valor de mercado de la posición. */
  readonly marketValue: number | null
  /** Plusvalía latente. */
  readonly unrealizedPnl: number | null
  /** Plusvalía latente en porcentaje sobre el coste. */
  readonly unrealizedPnlPercent: number | null
}

/**
 * Residuo por debajo del cual una cantidad se considera cero.
 *
 * Con fracciones de acción y de cripto, restar puede dejar restos del orden de
 * 1e-16 por la aritmética de coma flotante. Sin este umbral, una posición
 * cerrada del todo aparecería con «0,0000000000000002 unidades» y un coste
 * medio absurdo al dividir por ese resto.
 */
const DUST = 1e-9

/**
 * Deriva la posición de un símbolo a partir de sus transacciones.
 *
 * Las comisiones de compra **aumentan** el coste base y las de venta
 * **reducen** los ingresos: es el tratamiento estándar y el que hace que el
 * P&L refleje el dinero que realmente entró y salió.
 */
export function derivePosition(
  symbol: string,
  transactions: readonly PortfolioTransaction[],
): Position {
  let quantity = 0
  let costBasis = 0
  let realizedPnl = 0
  let soldQuantity = 0

  const ordered = [...transactions].sort((a, b) => a.executedAt - b.executedAt)

  for (const transaction of ordered) {
    if (transaction.quantity <= 0) continue

    if (transaction.side === 'buy') {
      costBasis += transaction.quantity * transaction.pricePerUnit + transaction.fees
      quantity += transaction.quantity
      continue
    }

    // Vender más de lo que se tiene no es un error del usuario que debamos
    // inventar: se vende como mucho lo disponible. Registrar una venta mayor
    // produciría una posición negativa y un coste medio sin sentido.
    const sold = Math.min(transaction.quantity, quantity)
    if (sold <= 0) continue

    const averageCost = quantity > DUST ? costBasis / quantity : 0
    const costOfSold = averageCost * sold
    const proceeds = sold * transaction.pricePerUnit - transaction.fees

    realizedPnl += proceeds - costOfSold
    costBasis -= costOfSold
    quantity -= sold
    soldQuantity += sold
  }

  // Posición cerrada: se limpian los restos de coma flotante para que no
  // aparezca una cantidad residual ni un coste medio calculado sobre ella.
  if (quantity <= DUST) {
    quantity = 0
    costBasis = 0
  }

  return {
    symbol,
    quantity,
    averageCost: quantity > 0 ? costBasis / quantity : 0,
    costBasis,
    realizedPnl,
    soldQuantity,
  }
}

/** Agrupa las transacciones por símbolo y deriva todas las posiciones. */
export function derivePositions(
  transactions: readonly PortfolioTransaction[],
): Position[] {
  const bySymbol = new Map<string, PortfolioTransaction[]>()

  for (const transaction of transactions) {
    const symbol = transaction.symbol.toUpperCase()
    const list = bySymbol.get(symbol) ?? []
    list.push(transaction)
    bySymbol.set(symbol, list)
  }

  return [...bySymbol.entries()].map(([symbol, list]) => derivePosition(symbol, list))
}

/** Añade el valor de mercado a una posición. */
export function withMarketValue(
  position: Position,
  price: number | null,
): PositionWithMarket {
  if (price === null || position.quantity === 0) {
    return {
      ...position,
      price,
      marketValue: price === null ? null : position.quantity * price,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
    }
  }

  const marketValue = position.quantity * price
  const unrealizedPnl = marketValue - position.costBasis

  return {
    ...position,
    price,
    marketValue,
    unrealizedPnl,
    // Sin coste base no hay porcentaje que calcular: dividir por cero daría
    // `Infinity` y se mostraría como una rentabilidad imposible.
    unrealizedPnlPercent:
      position.costBasis > DUST ? (unrealizedPnl / position.costBasis) * 100 : null,
  }
}

export interface PortfolioSummary {
  /** Valor de mercado de todas las posiciones abiertas. */
  readonly marketValue: number
  /** Dinero invertido que sigue en cartera. */
  readonly costBasis: number
  readonly unrealizedPnl: number
  readonly unrealizedPnlPercent: number | null
  readonly realizedPnl: number
  /** Dividendos cobrados, netos de retención. */
  readonly dividends: number
  /** Resultado total: latente + realizado + dividendos. */
  readonly totalPnl: number
  /** Cuántas posiciones siguen abiertas. */
  readonly openPositions: number
  /** Si alguna posición no tiene precio; el total está incompleto. */
  readonly hasMissingPrices: boolean
}

/**
 * Resumen del portafolio.
 *
 * `hasMissingPrices` importa: si falta el precio de un activo, el valor de
 * mercado y la plusvalía latente están incompletos, y presentarlos como cifras
 * definitivas sería engañoso. La interfaz lo advierte en lugar de sumar como si
 * ese activo valiera cero.
 */
export function summarize(
  positions: readonly PositionWithMarket[],
  dividends = 0,
): PortfolioSummary {
  const open = positions.filter((position) => position.quantity > 0)

  const marketValue = open.reduce((total, position) => total + (position.marketValue ?? 0), 0)
  const costBasis = open.reduce((total, position) => total + position.costBasis, 0)
  const realizedPnl = positions.reduce((total, position) => total + position.realizedPnl, 0)
  const unrealizedPnl = marketValue - costBasis

  return {
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis > DUST ? (unrealizedPnl / costBasis) * 100 : null,
    realizedPnl,
    dividends,
    totalPnl: unrealizedPnl + realizedPnl + dividends,
    openPositions: open.length,
    hasMissingPrices: open.some((position) => position.price === null),
  }
}
