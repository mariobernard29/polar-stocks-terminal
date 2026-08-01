import type { AssetClass } from '@shared/domain'
import * as favorites from '../../db/repositories/favorites'
import * as bookmarks from '../../db/repositories/news-bookmarks'
import * as watchlists from '../../db/repositories/watchlists'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

/**
 * Watchlists y favoritos.
 *
 * Los repositorios existen desde la Fase 1; aquí solo se exponen. Los errores de
 * base de datos se traducen a `DATABASE_ERROR` para que la interfaz distinga
 * «no se pudo guardar» de «no existe», que exigen mensajes distintos.
 */

const wrap = async <T>(operation: () => Promise<T>, message: string): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw new AppError('DATABASE_ERROR', message, { cause: error })
  }
}

export const listWatchlists: IpcHandler<'watchlists:list'> = () =>
  wrap(() => watchlists.listWatchlists(), 'No se pudieron cargar las listas.')

export const createWatchlist: IpcHandler<'watchlists:create'> = ({ name, color }) =>
  wrap(
    () => watchlists.createWatchlist(name, color ?? undefined),
    'No se pudo crear la lista.',
  )

export const renameWatchlist: IpcHandler<'watchlists:rename'> = ({ id, name }) =>
  wrap(() => watchlists.renameWatchlist(id, name), 'No se pudo renombrar la lista.')

export const deleteWatchlist: IpcHandler<'watchlists:delete'> = ({ id }) =>
  wrap(() => watchlists.deleteWatchlist(id), 'No se pudo eliminar la lista.')

export const addItem: IpcHandler<'watchlists:addItem'> = ({ watchlistId, symbol, assetClass }) =>
  wrap(
    () => watchlists.addItem(watchlistId, symbol.toUpperCase(), assetClass as AssetClass),
    'No se pudo añadir el activo.',
  )

export const removeItem: IpcHandler<'watchlists:removeItem'> = ({ itemId }) =>
  wrap(() => watchlists.removeItem(itemId), 'No se pudo quitar el activo.')

export const updateItem: IpcHandler<'watchlists:updateItem'> = ({ itemId, note, color }) =>
  wrap(
    () =>
      watchlists.updateItem(itemId, {
        ...(note !== undefined ? { note } : {}),
        ...(color !== undefined ? { color } : {}),
      }),
    'No se pudo actualizar el activo.',
  )

export const reorderWatchlists: IpcHandler<'watchlists:reorder'> = ({ orderedIds }) =>
  wrap(() => watchlists.reorderWatchlists(orderedIds), 'No se pudo reordenar.')

export const listFavorites: IpcHandler<'favorites:list'> = () =>
  wrap(() => favorites.listFavorites(), 'No se pudieron cargar los favoritos.')

export const toggleFavorite: IpcHandler<'favorites:toggle'> = ({ symbol, assetClass }) =>
  wrap(
    async () => ({
      isFavorite: await favorites.toggleFavorite(symbol, assetClass as AssetClass),
    }),
    'No se pudo actualizar el favorito.',
  )

// ─── Noticias guardadas ─────────────────────────────────────────────────────

export const listBookmarks: IpcHandler<'news:bookmarks'> = () =>
  wrap(
    async () =>
      (await bookmarks.listBookmarks()).map((row) => ({
        id: row.id,
        newsId: row.newsId,
        headline: row.headline,
        url: row.url,
        source: row.source,
        publishedAt: row.publishedAt.getTime(),
        // Los símbolos se guardan serializados; si el JSON estuviera corrupto,
        // la noticia sigue siendo útil sin ellos.
        symbols: parseSymbols(row.symbols),
      })),
    'No se pudieron cargar las noticias guardadas.',
  )

export const toggleBookmark: IpcHandler<'news:toggleBookmark'> = (item) =>
  wrap(
    async () => ({ saved: await bookmarks.toggleBookmark(item) }),
    'No se pudo guardar la noticia.',
  )

export const bookmarkedIds: IpcHandler<'news:bookmarkedIds'> = () =>
  wrap(() => bookmarks.bookmarkedIds(), 'No se pudieron cargar las noticias guardadas.')

function parseSymbols(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}
