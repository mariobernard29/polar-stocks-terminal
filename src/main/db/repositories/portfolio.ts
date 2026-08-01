import type {
  AssetClass,
  DividendInput,
  DividendRecord,
  PortfolioAccount,
  PositionRecord,
  TransactionInput,
  TransactionRecord,
} from '@shared/domain'
import { derivePositions, type PortfolioTransaction } from '@shared/portfolio/positions'
import { getPrisma } from '../client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Repositorio del portafolio
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Las posiciones **no tienen tabla**. Se derivan de las transacciones cada vez
 * que se piden. Guardar las dos cosas obligaría a mantenerlas sincronizadas en
 * cada alta, baja y edición, y basta un fallo para que el coste medio guardado
 * deje de corresponderse con el historial —sin ninguna señal de que ha pasado—.
 * Derivar es más trabajo por consulta y ni se nota: una cartera personal tiene
 * cientos de operaciones, no millones.
 */

/**
 * Convierte un `Decimal` de Prisma a `number`.
 *
 * Prisma devuelve `Decimal` para las columnas de dinero, que es lo correcto en
 * reposo, pero no sobrevive a la serialización del IPC: al otro lado llega un
 * objeto vacío. La conversión tiene que pasar aquí, en el borde.
 */
const toNumber = (value: unknown): number => Number(value)

function toTransaction(row: {
  id: string
  portfolioId: string
  symbol: string
  assetClass: string
  side: string
  quantity: number
  pricePerUnit: unknown
  fees: unknown
  currency: string
  executedAt: Date
  note: string | null
}): TransactionRecord {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    symbol: row.symbol,
    assetClass: row.assetClass as AssetClass,
    // La columna es `String` en el esquema porque SQLite no tiene enums. El
    // contrato solo admite estos dos valores, así que cualquier otra cosa sería
    // una fila corrupta; se trata como venta solo si lo dice explícitamente.
    side: row.side === 'sell' ? 'sell' : 'buy',
    quantity: row.quantity,
    pricePerUnit: toNumber(row.pricePerUnit),
    fees: toNumber(row.fees),
    currency: row.currency,
    executedAt: row.executedAt.getTime(),
    note: row.note,
  }
}

function toDividend(row: {
  id: string
  portfolioId: string
  symbol: string
  amount: unknown
  withholding: unknown
  currency: string
  paidAt: Date
}): DividendRecord {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    symbol: row.symbol,
    amount: toNumber(row.amount),
    withholding: toNumber(row.withholding),
    currency: row.currency,
    paidAt: row.paidAt.getTime(),
  }
}

const accountSelect = { id: true, name: true, currency: true, isActive: true } as const

// ─── Carteras ────────────────────────────────────────────────────────────────

export async function listPortfolios(): Promise<PortfolioAccount[]> {
  return getPrisma().portfolio.findMany({
    orderBy: { createdAt: 'asc' },
    select: accountSelect,
  })
}

export async function createPortfolio(
  name: string,
  currency: string,
): Promise<PortfolioAccount> {
  return getPrisma().portfolio.create({ data: { name, currency }, select: accountSelect })
}

export async function renamePortfolio(id: string, name: string): Promise<PortfolioAccount> {
  return getPrisma().portfolio.update({ where: { id }, data: { name }, select: accountSelect })
}

/**
 * Borra la cartera con todo su historial.
 *
 * Las transacciones y los dividendos caen por `onDelete: Cascade`. Es
 * destructivo y sin papelera, así que la interfaz pide confirmación escribiendo
 * el nombre: es el único dato de la aplicación que el usuario ha tecleado a mano
 * y que no se puede recuperar de ninguna API.
 */
export async function deletePortfolio(id: string): Promise<void> {
  await getPrisma().portfolio.delete({ where: { id } })
}

/**
 * Devuelve la cartera activa, creándola en el primer uso.
 *
 * Sin esto, la pantalla de portafolio abriría vacía pidiendo «crea una cartera
 * primero», que es un trámite que no aporta nada a quien solo quiere anotar su
 * primera compra.
 */
export async function ensureDefaultPortfolio(): Promise<PortfolioAccount> {
  const existing = await getPrisma().portfolio.findFirst({
    orderBy: { createdAt: 'asc' },
    select: accountSelect,
  })
  if (existing) return existing

  return createPortfolio('Mi cartera', 'USD')
}

// ─── Transacciones ───────────────────────────────────────────────────────────

export async function listTransactions(
  portfolioId: string,
  symbol: string | null = null,
): Promise<TransactionRecord[]> {
  const rows = await getPrisma().transaction.findMany({
    where: { portfolioId, ...(symbol ? { symbol: symbol.toUpperCase() } : {}) },
    // Más reciente primero: es el orden en que se lee un historial. El cálculo
    // de posiciones reordena por su cuenta, así que no depende de esto.
    orderBy: [{ executedAt: 'desc' }, { createdAt: 'desc' }],
  })

  return rows.map(toTransaction)
}

export async function addTransaction(input: TransactionInput): Promise<TransactionRecord> {
  const row = await getPrisma().transaction.create({
    data: {
      portfolioId: input.portfolioId,
      symbol: input.symbol.toUpperCase(),
      assetClass: input.assetClass,
      side: input.side,
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      fees: input.fees,
      currency: input.currency,
      executedAt: new Date(input.executedAt),
      note: input.note,
    },
  })

  return toTransaction(row)
}

export async function deleteTransaction(id: string): Promise<void> {
  await getPrisma().transaction.delete({ where: { id } })
}

// ─── Dividendos ──────────────────────────────────────────────────────────────

export async function listDividends(portfolioId: string): Promise<DividendRecord[]> {
  const rows = await getPrisma().dividend.findMany({
    where: { portfolioId },
    orderBy: { paidAt: 'desc' },
  })

  return rows.map(toDividend)
}

export async function addDividend(input: DividendInput): Promise<DividendRecord> {
  const row = await getPrisma().dividend.create({
    data: {
      portfolioId: input.portfolioId,
      symbol: input.symbol.toUpperCase(),
      amount: input.amount,
      withholding: input.withholding,
      currency: input.currency,
      paidAt: new Date(input.paidAt),
    },
  })

  return toDividend(row)
}

export async function deleteDividend(id: string): Promise<void> {
  await getPrisma().dividend.delete({ where: { id } })
}

// ─── Posiciones ──────────────────────────────────────────────────────────────

/**
 * Deriva las posiciones de una cartera.
 *
 * Devuelve también las cerradas (cantidad cero): su resultado realizado forma
 * parte de la rentabilidad total, y omitirlas haría que las ganancias de lo ya
 * vendido desaparecieran de la cuenta.
 */
export async function listPositions(portfolioId: string): Promise<PositionRecord[]> {
  const [transactions, dividends] = await Promise.all([
    getPrisma().transaction.findMany({
      where: { portfolioId },
      select: {
        symbol: true,
        assetClass: true,
        side: true,
        quantity: true,
        pricePerUnit: true,
        fees: true,
        executedAt: true,
      },
    }),
    getPrisma().dividend.findMany({
      where: { portfolioId },
      select: { symbol: true, amount: true, withholding: true },
    }),
  ])

  // La clase de activo no interviene en el cálculo, pero la interfaz la
  // necesita para formatear el precio: cinco decimales en divisas, dos en
  // acciones. Se toma de la última operación registrada de cada símbolo.
  const assetClassBySymbol = new Map<string, AssetClass>()
  for (const row of transactions) {
    assetClassBySymbol.set(row.symbol.toUpperCase(), row.assetClass as AssetClass)
  }

  const netDividends = new Map<string, number>()
  for (const row of dividends) {
    const symbol = row.symbol.toUpperCase()
    const net = toNumber(row.amount) - toNumber(row.withholding)
    netDividends.set(symbol, (netDividends.get(symbol) ?? 0) + net)
  }

  const input: PortfolioTransaction[] = transactions.map((row) => ({
    symbol: row.symbol,
    side: row.side === 'sell' ? 'sell' : 'buy',
    quantity: row.quantity,
    pricePerUnit: toNumber(row.pricePerUnit),
    fees: toNumber(row.fees),
    executedAt: row.executedAt.getTime(),
  }))

  return derivePositions(input).map((position) => ({
    ...position,
    assetClass: assetClassBySymbol.get(position.symbol) ?? 'stock',
    dividends: netDividends.get(position.symbol) ?? 0,
  }))
}
