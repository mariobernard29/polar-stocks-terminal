import { z } from 'zod'
import { marketStateSchema, symbolSchema } from './instrument'

/**
 * Cotización puntual de un activo.
 *
 * Todas las marcas de tiempo son **epoch en milisegundos (UTC)**, nunca cadenas
 * con formato. Una cadena obliga a decidir zona horaria en cada frontera y es
 * la fuente clásica de errores de un día en aplicaciones financieras.
 *
 * Los precios son `number`. Es suficiente para mostrar y para gráficos; el
 * dinero del portafolio (coste base, P&L realizado) se almacena aparte en
 * unidades enteras mínimas para no acumular error de coma flotante.
 */
export const quoteSchema = z.object({
  symbol: symbolSchema,
  price: z.number(),

  /** Variación absoluta frente al cierre anterior. */
  change: z.number(),
  /** Variación porcentual. 2.41 significa +2,41 %. */
  changePercent: z.number(),

  previousClose: z.number().nullable(),
  open: z.number().nullable(),
  dayHigh: z.number().nullable(),
  dayLow: z.number().nullable(),
  volume: z.number().nullable(),

  marketState: marketStateSchema,

  /**
   * Precio fuera de sesión (pre-market o after-hours). `null` cuando el
   * proveedor no lo ofrece o el mercado está en sesión regular — distinguir
   * "no hay dato" de "no aplica" importa para no pintar un cero engañoso.
   */
  extendedPrice: z.number().nullable(),
  extendedChangePercent: z.number().nullable(),

  currency: z.string().length(3).nullable(),

  /** Momento del dato según el proveedor (epoch ms). */
  timestamp: z.number().int(),
  /** Proveedor que sirvió el dato. Se muestra en la UI para trazabilidad. */
  source: z.string(),
})
export type Quote = z.infer<typeof quoteSchema>
