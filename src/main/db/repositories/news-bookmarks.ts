import type { NewsItem } from '@shared/domain'
import { getPrisma } from '../client'

/**
 * Noticias guardadas.
 *
 * Se almacena una copia del titular, la fuente y el enlace, **no solo el
 * identificador**. Los proveedores rotan su índice y una noticia de hace un mes
 * puede desaparecer de su API; guardar solo la referencia dejaría la lista de
 * favoritos llena de huecos con el tiempo.
 */

export interface BookmarkRecord {
  id: string
  newsId: string
  headline: string
  url: string
  source: string
  publishedAt: Date
  symbols: string
}

export async function listBookmarks(): Promise<BookmarkRecord[]> {
  return getPrisma().newsBookmark.findMany({ orderBy: { publishedAt: 'desc' }, take: 200 })
}

/** Alterna el guardado. Devuelve si la noticia quedó guardada. */
export async function toggleBookmark(item: NewsItem): Promise<boolean> {
  const prisma = getPrisma()

  const existing = await prisma.newsBookmark.findUnique({ where: { newsId: item.id } })
  if (existing) {
    await prisma.newsBookmark.delete({ where: { newsId: item.id } })
    return false
  }

  await prisma.newsBookmark.create({
    data: {
      newsId: item.id,
      headline: item.headline,
      url: item.url,
      source: item.source,
      publishedAt: new Date(item.publishedAt),
      symbols: JSON.stringify(item.symbols),
    },
  })
  return true
}

/** Identificadores guardados, para marcar la estrella sin consultar uno a uno. */
export async function bookmarkedIds(): Promise<string[]> {
  const rows = await getPrisma().newsBookmark.findMany({ select: { newsId: true } })
  return rows.map((row) => row.newsId)
}
