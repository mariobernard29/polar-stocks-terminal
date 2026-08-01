import type { AssetClass } from '@shared/domain'
import { getPrisma } from '../client'

/**
 * Repositorio de listas de seguimiento.
 *
 * Las cotizaciones NO viven aquí: esta capa solo guarda qué símbolos sigue el
 * usuario y cómo los ha organizado. Los precios llegan de la capa de
 * proveedores y se combinan en el renderer. Mezclar ambas cosas obligaría a
 * escribir en disco en cada tick.
 */

export interface WatchlistItemRecord {
  id: string
  symbol: string
  assetClass: string
  note: string | null
  color: string | null
  position: number
}

export interface WatchlistRecord {
  id: string
  name: string
  color: string | null
  position: number
  items: WatchlistItemRecord[]
}

const itemSelect = {
  id: true,
  symbol: true,
  assetClass: true,
  note: true,
  color: true,
  position: true,
} as const

export async function listWatchlists(): Promise<WatchlistRecord[]> {
  return getPrisma().watchlist.findMany({
    orderBy: { position: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      position: true,
      items: { orderBy: { position: 'asc' }, select: itemSelect },
    },
  })
}

export async function createWatchlist(name: string, color?: string): Promise<WatchlistRecord> {
  // La nueva lista va al final: `position` es el orden manual del usuario.
  const last = await getPrisma().watchlist.findFirst({
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  return getPrisma().watchlist.create({
    data: { name, color: color ?? null, position: (last?.position ?? -1) + 1 },
    select: {
      id: true,
      name: true,
      color: true,
      position: true,
      items: { select: itemSelect },
    },
  })
}

export async function renameWatchlist(id: string, name: string): Promise<void> {
  await getPrisma().watchlist.update({ where: { id }, data: { name } })
}

export async function deleteWatchlist(id: string): Promise<void> {
  // Los items caen por `onDelete: Cascade` en el esquema.
  await getPrisma().watchlist.delete({ where: { id } })
}

/** Reordena las listas según el orden recibido tras arrastrar. */
export async function reorderWatchlists(orderedIds: readonly string[]): Promise<void> {
  const prisma = getPrisma()
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.watchlist.update({ where: { id }, data: { position: index } }),
    ),
  )
}

export async function addItem(
  watchlistId: string,
  symbol: string,
  assetClass: AssetClass,
): Promise<WatchlistItemRecord> {
  const last = await getPrisma().watchlistItem.findFirst({
    where: { watchlistId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  return getPrisma().watchlistItem.create({
    data: { watchlistId, symbol, assetClass, position: (last?.position ?? -1) + 1 },
    select: itemSelect,
  })
}

export async function removeItem(itemId: string): Promise<void> {
  await getPrisma().watchlistItem.delete({ where: { id: itemId } })
}

export async function updateItem(
  itemId: string,
  data: { note?: string | null; color?: string | null },
): Promise<void> {
  await getPrisma().watchlistItem.update({ where: { id: itemId }, data })
}

export async function reorderItems(orderedIds: readonly string[]): Promise<void> {
  const prisma = getPrisma()
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.watchlistItem.update({ where: { id }, data: { position: index } }),
    ),
  )
}
