import { z } from 'zod'
import { assetClassSchema, symbolSchema } from './instrument'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Portafolio
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tipos que cruzan el puente IPC. El cálculo vive en `@shared/portfolio`, y lo
 * ejecuta el **renderer**: así el valor de la cartera se recalcula con cada tick
 * del WebSocket sin volver a pedir nada al proceso principal.
 *
 * Todos los importes son `number`, no `Decimal`. La base de datos guarda
 * `Decimal` —lo correcto para dinero en reposo—, pero un `Decimal` de Prisma no
 * sobrevive a la serialización del IPC. La conversión se hace en el repositorio,
 * y `number` da 15 dígitos significativos: de sobra para una cartera personal,
 * donde el error acumulado queda muy por debajo del céntimo.
 *
 * La validación de aquí es la que protege la base de datos. El formulario del
 * renderer también valida, pero eso es cortesía hacia el usuario; esto es lo que
 * impide que una cantidad negativa o un `NaN` acaben en disco y envenenen todos
 * los cálculos posteriores.
 */

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'La moneda debe ser un código ISO 4217 de tres letras.')

/**
 * Importe monetario.
 *
 * `.finite()` no es decorativo: un `Infinity` o un `NaN` colado en el precio
 * contamina el coste medio, y a partir de ahí toda la cartera muestra `NaN` sin
 * ninguna pista de dónde vino.
 */
const money = z.number().finite()

/** Límite defensivo: por encima de esto es un error de tecleo, no una cartera. */
const MAX_AMOUNT = 1e12

export const portfolioAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Moneda base para agregar rentabilidad (ISO 4217). */
  currency: z.string(),
  isActive: z.boolean(),
})
export type PortfolioAccount = z.infer<typeof portfolioAccountSchema>

export const transactionSchema = z.object({
  id: z.string(),
  portfolioId: z.string(),
  symbol: symbolSchema,
  assetClass: assetClassSchema,
  side: z.enum(['buy', 'sell']),
  quantity: z.number(),
  pricePerUnit: z.number(),
  fees: z.number(),
  currency: z.string(),
  /** Epoch ms. */
  executedAt: z.number().int(),
  note: z.string().nullable(),
})
export type TransactionRecord = z.infer<typeof transactionSchema>

export const transactionInputSchema = z.object({
  portfolioId: z.string().min(1),
  symbol: symbolSchema,
  assetClass: assetClassSchema,
  side: z.enum(['buy', 'sell']),
  // Estrictamente positiva: una operación de cero unidades no es una operación,
  // y una negativa es la forma equivocada de expresar el otro lado.
  quantity: money.positive().max(MAX_AMOUNT),
  // Cero se permite: hay entregas a coste nulo (splits, acciones de empresa).
  pricePerUnit: money.nonnegative().max(MAX_AMOUNT),
  fees: money.nonnegative().max(MAX_AMOUNT).default(0),
  currency: currencySchema.default('USD'),
  executedAt: z.number().int(),
  note: z.string().trim().max(500).nullable().default(null),
})
export type TransactionInput = z.infer<typeof transactionInputSchema>

export const dividendSchema = z.object({
  id: z.string(),
  portfolioId: z.string(),
  symbol: symbolSchema,
  /** Importe bruto cobrado. */
  amount: z.number(),
  /** Retención en origen. El neto es `amount - withholding`. */
  withholding: z.number(),
  currency: z.string(),
  /** Epoch ms. */
  paidAt: z.number().int(),
})
export type DividendRecord = z.infer<typeof dividendSchema>

export const dividendInputSchema = z.object({
  portfolioId: z.string().min(1),
  symbol: symbolSchema,
  amount: money.positive().max(MAX_AMOUNT),
  withholding: money.nonnegative().max(MAX_AMOUNT).default(0),
  currency: currencySchema.default('USD'),
  paidAt: z.number().int(),
})
export type DividendInput = z.infer<typeof dividendInputSchema>

/** Posición derivada, sin precio de mercado: eso lo añade el renderer. */
export const positionSchema = z.object({
  symbol: symbolSchema,
  assetClass: assetClassSchema,
  quantity: z.number(),
  averageCost: z.number(),
  costBasis: z.number(),
  realizedPnl: z.number(),
  soldQuantity: z.number(),
  /** Dividendos netos cobrados de este símbolo. */
  dividends: z.number(),
})
export type PositionRecord = z.infer<typeof positionSchema>
