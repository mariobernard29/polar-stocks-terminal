import { z } from 'zod'
import { assetClassSchema, symbolSchema } from './instrument'

/**
 * Ficha de una empresa o activo.
 *
 * Casi todos los campos son anulables a propósito: ningún proveedor los da
 * todos, y los que faltan cambian según el plan contratado. Un `null` significa
 * «este proveedor no lo ofrece», que es información distinta de «vale cero» —
 * y en una ficha de empresa, mostrar un cero inventado es peor que dejar el
 * hueco.
 */
export const companyProfileSchema = z.object({
  symbol: symbolSchema,
  name: z.string(),
  assetClass: assetClassSchema,

  exchange: z.string().nullable(),
  currency: z.string().nullable(),
  country: z.string().nullable(),

  sector: z.string().nullable(),
  industry: z.string().nullable(),
  /** Texto largo. Puede venir en inglés aunque la interfaz esté en español. */
  description: z.string().nullable(),
  ceo: z.string().nullable(),
  employees: z.number().int().nullable(),
  website: z.url().nullable(),
  logoUrl: z.url().nullable(),

  marketCap: z.number().nullable(),
  sharesOutstanding: z.number().nullable(),
  /** Fecha de salida a bolsa, epoch ms. */
  ipoDate: z.number().int().nullable(),

  peRatio: z.number().nullable(),
  eps: z.number().nullable(),
  dividendYield: z.number().nullable(),
  beta: z.number().nullable(),

  /** Rango de las últimas 52 semanas. */
  weekLow52: z.number().nullable(),
  weekHigh52: z.number().nullable(),

  source: z.string(),
})
export type CompanyProfile = z.infer<typeof companyProfileSchema>
