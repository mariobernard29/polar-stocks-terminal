import type { InvokeArgs } from '@shared/ipc/api'
import type {
  IpcChannel,
  IpcEventName,
  IpcEventPayload,
  IpcInput,
  IpcOutput,
} from '@shared/ipc/contract'
import { PolarError } from '@shared/ipc/errors'

/**
 * Cliente IPC del renderer.
 *
 * El puente devuelve un sobre `{ ok, data | error }` porque Electron destroza
 * los `Error` al serializarlos. Aquí se deshace ese sobre y se vuelve a lanzar
 * un `PolarError` con su código intacto, de modo que el resto del renderer
 * escriba `try/catch` normal y TanStack Query trate los fallos como fallos.
 *
 * Toda la ergonomía vive en esta capa, no en el preload: el preload es
 * superficie de seguridad y conviene que siga siendo diminuto.
 */
export async function call<K extends IpcChannel>(
  channel: K,
  ...args: InvokeArgs<K>
): Promise<IpcOutput<K>> {
  const result = await window.polar.invoke(channel, ...args)
  if (!result.ok) throw new PolarError(result.error)
  return result.data
}

/**
 * Se suscribe a un evento push del main. Devuelve la función de cancelación,
 * lista para usarse como retorno de un `useEffect`.
 */
export function on<E extends IpcEventName>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): () => void {
  return window.polar.subscribe(event, listener)
}

/**
 * Fachada con nombres. Es lo que usa el resto del renderer: los canales en
 * crudo se quedan aquí dentro, de modo que renombrar uno no obliga a tocar
 * veinte componentes.
 */
export const ipc = {
  app: {
    ping: () => call('app:ping'),
    info: () => call('app:info'),
    openExternal: (url: string) => call('app:openExternal', { url }),
  },
  window: {
    minimize: () => call('window:minimize'),
    toggleMaximize: () => call('window:toggleMaximize'),
    close: () => call('window:close'),
    isMaximized: () => call('window:isMaximized'),
    toggleFullscreen: () => call('window:toggleFullscreen'),
  },
  settings: {
    getAll: () => call('settings:getAll'),
    update: (patch: IpcInput<'settings:update'>) => call('settings:update', patch),
    reset: () => call('settings:reset'),
  },
  db: {
    status: () => call('db:status'),
  },
  providers: {
    list: () => call('providers:list'),
    capabilities: () => call('providers:capabilities'),
    test: (provider: string) => call('providers:test', { provider }),
    setCredential: (provider: string, apiKey: string) =>
      call('providers:setCredential', { provider, apiKey }),
    removeCredential: (provider: string) => call('providers:removeCredential', { provider }),
    setConfig: (input: IpcInput<'providers:setConfig'>) => call('providers:setConfig', input),
  },
  market: {
    quote: (symbol: string) => call('market:quote', { symbol }),
    search: (input: IpcInput<'market:search'>) => call('market:search', input),
    news: (input: IpcInput<'market:news'>) => call('market:news', input),
    historical: (input: IpcInput<'market:historical'>) => call('market:historical', input),
    profile: (symbol: string) => call('market:profile', { symbol }),
    cryptoMetrics: (symbol: string) => call('market:cryptoMetrics', { symbol }),
    calendar: (input: IpcInput<'market:calendar'>) => call('market:calendar', input),
    screener: (input: IpcInput<'market:screener'>) => call('market:screener', input),
    subscribe: (symbols: string[]) => call('market:subscribe', { symbols }),
    unsubscribe: (symbols: string[]) => call('market:unsubscribe', { symbols }),
    streamStatus: () => call('market:streamStatus'),
  },
  watchlists: {
    list: () => call('watchlists:list'),
    create: (name: string, color?: string | null) =>
      call('watchlists:create', { name, color: color ?? null }),
    rename: (id: string, name: string) => call('watchlists:rename', { id, name }),
    remove: (id: string) => call('watchlists:delete', { id }),
    addItem: (input: IpcInput<'watchlists:addItem'>) => call('watchlists:addItem', input),
    removeItem: (itemId: string) => call('watchlists:removeItem', { itemId }),
    updateItem: (input: IpcInput<'watchlists:updateItem'>) => call('watchlists:updateItem', input),
    reorder: (orderedIds: string[]) => call('watchlists:reorder', { orderedIds }),
  },
  newsBookmarks: {
    list: () => call('news:bookmarks'),
    ids: () => call('news:bookmarkedIds'),
    toggle: (item: IpcInput<'news:toggleBookmark'>) => call('news:toggleBookmark', item),
  },
  favorites: {
    list: () => call('favorites:list'),
    toggle: (input: IpcInput<'favorites:toggle'>) => call('favorites:toggle', input),
  },
  layouts: {
    list: () => call('layouts:list'),
    get: (id: string) => call('layouts:get', { id }),
    getDefault: () => call('layouts:getDefault'),
    save: (name: string, state: string) => call('layouts:save', { name, state }),
    rename: (id: string, name: string) => call('layouts:rename', { id, name }),
    remove: (id: string) => call('layouts:delete', { id }),
    setDefault: (id: string) => call('layouts:setDefault', { id }),
  },
} as const
