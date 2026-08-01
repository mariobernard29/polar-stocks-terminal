import type { AssetClass } from '@shared/domain'
import { getPrisma } from '../client'

/**
 * Favoritos: acceso rápido, independiente de las watchlists.
 *
 * Una watchlist es una agrupación con intención («Tecnología», «Vigilar»); un
 * favorito es simplemente algo que se consulta a menudo. Mezclarlos obligaría a
 * crear una lista llamada «Favoritos» y a tratarla distinto del resto, que es
 * peor que tener dos conceptos claros.
 */

export interface FavoriteRecord {
  id: string
  symbol: string
  assetClass: string
  position: number
}

export async function listFavorites(): Promise<FavoriteRecord[]> {
  return getPrisma().favorite.findMany({
    orderBy: { position: 'asc' },
    select: { id: true, symbol: true, assetClass: true, position: true },
  })
}

/**
 * Alterna el estado de favorito. Devuelve si quedó marcado.
 *
 * Una sola operación en vez de `add` y `remove` separadas: la interfaz solo
 * tiene una estrella, y con dos llamadas habría que consultar antes el estado
 * actual — una ida y vuelta de más y una carrera si se pulsa dos veces rápido.
 */
export async function toggleFavorite(
  symbol: string,
  assetClass: AssetClass,
): Promise<boolean> {
  const prisma = getPrisma()
  const upper = symbol.toUpperCase()

  const existing = await prisma.favorite.findUnique({ where: { symbol: upper } })
  if (existing) {
    await prisma.favorite.delete({ where: { symbol: upper } })
    return false
  }

  const last = await prisma.favorite.findFirst({
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  await prisma.favorite.create({
    data: { symbol: upper, assetClass, position: (last?.position ?? -1) + 1 },
  })
  return true
}

export async function isFavorite(symbol: string): Promise<boolean> {
  const found = await getPrisma().favorite.findUnique({
    where: { symbol: symbol.toUpperCase() },
    select: { id: true },
  })
  return found !== null
}
