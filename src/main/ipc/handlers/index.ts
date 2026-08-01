import type { IpcHandlers } from '../register'
import * as appHandlers from './app'
import * as dbHandlers from './db'
import * as layoutHandlers from './layouts'
import * as marketHandlers from './market'
import * as portfolioHandlers from './portfolio'
import * as providerHandlers from './providers'
import * as realtimeHandlers from './realtime'
import * as settingsHandlers from './settings'
import * as windowHandlers from './window'
import * as workspaceData from './workspace-data'

/**
 * Ensamblaje de todos los handlers.
 *
 * El tipo `IpcHandlers` cubre todos los canales del contrato, así que si se
 * añade un canal y se olvida su handler, este objeto deja de compilar. Ese es
 * exactamente el punto: el olvido se detecta al escribirlo, no en producción.
 */
export const handlers: IpcHandlers = {
  'app:ping': appHandlers.ping,
  'app:info': appHandlers.info,
  'app:openExternal': appHandlers.openExternal,

  'window:minimize': windowHandlers.minimize,
  'window:toggleMaximize': windowHandlers.toggleMaximize,
  'window:close': windowHandlers.close,
  'window:isMaximized': windowHandlers.isMaximized,
  'window:toggleFullscreen': windowHandlers.toggleFullscreen,

  'settings:getAll': settingsHandlers.getAll,
  'settings:update': settingsHandlers.update,
  'settings:reset': settingsHandlers.reset,

  'db:status': dbHandlers.status,

  'providers:list': providerHandlers.list,
  'providers:setCredential': providerHandlers.setCredentialHandler,
  'providers:removeCredential': providerHandlers.removeCredentialHandler,
  'providers:setConfig': providerHandlers.setConfig,
  'providers:capabilities': providerHandlers.capabilities,
  'providers:test': providerHandlers.test,

  'market:quote': marketHandlers.quote,
  'market:search': marketHandlers.search,
  'market:news': marketHandlers.news,
  'market:historical': marketHandlers.historical,
  'market:profile': marketHandlers.profile,
  'market:cryptoMetrics': marketHandlers.cryptoMetrics,
  'market:calendar': marketHandlers.calendar,
  'market:screener': marketHandlers.screener,
  'market:subscribe': realtimeHandlers.subscribe,
  'market:unsubscribe': realtimeHandlers.unsubscribe,
  'market:streamStatus': realtimeHandlers.streamStatus,

  'layouts:list': layoutHandlers.list,
  'layouts:get': layoutHandlers.get,
  'layouts:save': layoutHandlers.save,
  'layouts:rename': layoutHandlers.rename,
  'layouts:delete': layoutHandlers.remove,
  'layouts:setDefault': layoutHandlers.setDefault,
  'layouts:getDefault': layoutHandlers.getDefault,

  'watchlists:list': workspaceData.listWatchlists,
  'watchlists:create': workspaceData.createWatchlist,
  'watchlists:rename': workspaceData.renameWatchlist,
  'watchlists:delete': workspaceData.deleteWatchlist,
  'watchlists:addItem': workspaceData.addItem,
  'watchlists:removeItem': workspaceData.removeItem,
  'watchlists:updateItem': workspaceData.updateItem,
  'watchlists:reorder': workspaceData.reorderWatchlists,

  'favorites:list': workspaceData.listFavorites,
  'favorites:toggle': workspaceData.toggleFavorite,

  'news:bookmarks': workspaceData.listBookmarks,
  'news:toggleBookmark': workspaceData.toggleBookmark,
  'news:bookmarkedIds': workspaceData.bookmarkedIds,

  'portfolio:list': portfolioHandlers.list,
  'portfolio:create': portfolioHandlers.create,
  'portfolio:rename': portfolioHandlers.rename,
  'portfolio:delete': portfolioHandlers.remove,
  'portfolio:transactions': portfolioHandlers.transactions,
  'portfolio:addTransaction': portfolioHandlers.addTransaction,
  'portfolio:deleteTransaction': portfolioHandlers.deleteTransaction,
  'portfolio:positions': portfolioHandlers.positions,
  'portfolio:dividends': portfolioHandlers.dividends,
  'portfolio:addDividend': portfolioHandlers.addDividend,
  'portfolio:deleteDividend': portfolioHandlers.deleteDividend,
}
