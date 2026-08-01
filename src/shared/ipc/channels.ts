/**
 * Nombres de canales y eventos — **sin ninguna dependencia**.
 *
 * Este archivo existe separado del contrato por una razón concreta: el preload
 * necesita la lista de canales para su lista blanca, pero corre en sandbox,
 * donde no puede hacer `require` de módulos npm. Si importara el contrato,
 * arrastraría zod y el preload fallaría al cargar con «module not found».
 *
 * Aparte del sandbox, es buena higiene: el puente es superficie de seguridad y
 * no tiene por qué cargar una librería de validación que nunca ejecuta.
 *
 * La sincronía con el contrato no depende de la disciplina de nadie: en
 * `contract.ts` se declara `satisfies Record<IpcChannelName, ChannelDefinition>`,
 * de modo que sobra o falta un canal → error de compilación.
 */

export const IPC_CHANNEL_NAMES = [
  'app:ping',
  'app:info',
  'app:openExternal',

  'window:minimize',
  'window:toggleMaximize',
  'window:close',
  'window:isMaximized',
  'window:toggleFullscreen',

  'settings:getAll',
  'settings:update',
  'settings:reset',

  'db:status',

  'providers:list',
  'providers:setCredential',
  'providers:removeCredential',
  'providers:setConfig',
  'providers:capabilities',
  'providers:test',

  'market:quote',
  'market:search',
  'market:news',
  'market:historical',
  'market:profile',
  'market:cryptoMetrics',
  'market:calendar',
  'market:screener',
  'market:subscribe',
  'market:unsubscribe',
  'market:streamStatus',

  'layouts:list',
  'layouts:get',
  'layouts:save',
  'layouts:rename',
  'layouts:delete',
  'layouts:setDefault',
  'layouts:getDefault',

  'watchlists:list',
  'watchlists:create',
  'watchlists:rename',
  'watchlists:delete',
  'watchlists:addItem',
  'watchlists:removeItem',
  'watchlists:updateItem',
  'watchlists:reorder',

  'favorites:list',
  'favorites:toggle',

  'news:bookmarks',
  'news:toggleBookmark',
  'news:bookmarkedIds',

  'portfolio:list',
  'portfolio:create',
  'portfolio:rename',
  'portfolio:delete',
  'portfolio:transactions',
  'portfolio:addTransaction',
  'portfolio:deleteTransaction',
  'portfolio:positions',
  'portfolio:dividends',
  'portfolio:addDividend',
  'portfolio:deleteDividend',

  'alerts:list',
  'alerts:create',
  'alerts:setEnabled',
  'alerts:delete',
  'alerts:triggers',
  'alerts:acknowledge',
  'alerts:acknowledgeAll',
  'alerts:capabilities',
] as const

export type IpcChannelName = (typeof IPC_CHANNEL_NAMES)[number]

export const IPC_EVENT_NAMES = [
  'window:maximizedChanged',
  'market:ticks',
  'market:streamStatus',
  'alerts:triggered',
] as const

export type IpcEventName = (typeof IPC_EVENT_NAMES)[number]

/** Prefijo de los eventos push en el canal de Electron. */
export const EVENT_CHANNEL_PREFIX = 'event:'
