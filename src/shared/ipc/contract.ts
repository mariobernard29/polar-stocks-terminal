import { z } from 'zod'
import {
  IPC_CHANNEL_NAMES,
  IPC_EVENT_NAMES,
  type IpcChannelName,
  type IpcEventName,
} from './channels'
import { settingsSchema } from '../settings'
import {
  alertInputSchema,
  alertSchema,
  alertTriggerSchema,
  assetClassSchema,
  calendarEventSchema,
  calendarQuerySchema,
  candleSeriesSchema,
  capabilityStatusSchema,
  companyProfileSchema,
  cryptoMetricsSchema,
  currencySchema,
  dividendInputSchema,
  dividendSchema,
  instrumentSchema,
  newsItemSchema,
  portfolioAccountSchema,
  positionSchema,
  quoteSchema,
  screenerQuerySchema,
  screenerRowSchema,
  symbolSchema,
  transactionInputSchema,
  transactionSchema,
} from '../domain'
import {
  historicalQuerySchema,
  newsQuerySchema,
  quoteQuerySchema,
  searchQuerySchema,
} from '../domain/queries'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato IPC
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Única fuente de verdad de todo lo que cruza entre el renderer y el main.
 * De este objeto se derivan, sin repetir nada:
 *
 *   1. Los tipos de entrada y salida de cada canal.
 *   2. La validación en tiempo de ejecución (main valida el input; en
 *      desarrollo también valida su propia salida).
 *   3. La firma de `window.polar.invoke`.
 *   4. La comprobación de exhaustividad: si un canal no tiene handler
 *      registrado, falla el typecheck, no el runtime.
 *
 * Añadir un endpoint = añadir una entrada aquí. El compilador exige el resto.
 *
 * Nomenclatura de canales: `dominio:acción`.
 */

/** Forma que debe cumplir cada entrada del contrato. */
type ChannelDefinition = {
  readonly input: z.ZodType
  readonly output: z.ZodType
}

export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  isPackaged: z.boolean(),
  versions: z.object({
    electron: z.string(),
    chrome: z.string(),
    node: z.string(),
  }),
})
export type AppInfo = z.infer<typeof appInfoSchema>

export const databaseStatusSchema = z.object({
  /** Ruta del archivo SQLite. Útil para que el usuario haga copias de seguridad. */
  path: z.string(),
  /** Nombres de las migraciones aplicadas durante este arranque. */
  appliedNow: z.array(z.string()),
  /** Migraciones que ya estaban aplicadas. */
  alreadyApplied: z.number().int(),
  /** Tamaño del archivo en bytes. */
  sizeBytes: z.number().int(),
})
export type DatabaseStatus = z.infer<typeof databaseStatusSchema>

/**
 * Resumen de un proveedor para la pantalla de Configuración.
 *
 * `masked` es lo más cerca que el renderer llega de una clave: puntos y los
 * cuatro últimos caracteres, calculados en el proceso main. La clave en sí
 * nunca cruza el IPC.
 */
export const providerSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  requiresApiKey: z.boolean(),
  docsUrl: z.string().nullable(),
  hasSecret: z.boolean(),
  masked: z.string().nullable(),
  enabled: z.boolean(),
  priority: z.number().int(),
  lastCheckedAt: z.number().int().nullable(),
  lastCheckOk: z.boolean().nullable(),
  lastCheckNote: z.string().nullable(),
  /** Capacidades que este proveedor sabe servir. */
  capabilities: z.array(z.string()),
})
export type ProviderSummary = z.infer<typeof providerSummarySchema>

export const layoutSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  /** Epoch ms, como todas las fechas que cruzan el IPC. */
  updatedAt: z.number().int(),
})
export type LayoutSummary = z.infer<typeof layoutSummarySchema>

export const layoutRecordSchema = layoutSummarySchema.extend({
  state: z.string(),
})
export type LayoutRecord = z.infer<typeof layoutRecordSchema>

/** Una operación en vivo. Lo mínimo para refrescar un precio en pantalla. */
export const tickSchema = z.object({
  symbol: symbolSchema,
  price: z.number(),
  /** Epoch ms, como todas las marcas de tiempo del proyecto. */
  timestamp: z.number().int(),
  volume: z.number().nullable(),
})
export type Tick = z.infer<typeof tickSchema>

export const watchlistItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  assetClass: z.string(),
  note: z.string().nullable(),
  color: z.string().nullable(),
  position: z.number().int(),
})
export type WatchlistItem = z.infer<typeof watchlistItemSchema>

export const watchlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  position: z.number().int(),
  items: z.array(watchlistItemSchema),
})
export type Watchlist = z.infer<typeof watchlistSchema>

export const newsBookmarkSchema = z.object({
  id: z.string(),
  newsId: z.string(),
  headline: z.string(),
  url: z.string(),
  source: z.string(),
  /** Epoch ms, como todas las fechas del contrato. */
  publishedAt: z.number().int(),
  symbols: z.array(z.string()),
})
export type NewsBookmark = z.infer<typeof newsBookmarkSchema>

export const favoriteSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  assetClass: z.string(),
  position: z.number().int(),
})
export type Favorite = z.infer<typeof favoriteSchema>

export const streamStatusSchema = z.enum(['connecting', 'open', 'closed'])
export type StreamStatus = z.infer<typeof streamStatusSchema>

export const ipcContract = {
  /** Comprobación de vida del puente. La usa el arranque y el driver de pruebas. */
  'app:ping': {
    input: z.void(),
    output: z.literal('pong'),
  },

  /** Datos de la app y del entorno. Alimenta Configuración → Acerca de. */
  'app:info': {
    input: z.void(),
    output: appInfoSchema,
  },

  /**
   * Abre una URL en el navegador del sistema.
   *
   * El esquema restringe a `https` deliberadamente: sin esto, un enlace
   * malicioso en una noticia de terceros podría intentar `file://` para abrir
   * algo del disco del usuario. La validación vive en el contrato, así que se
   * aplica sí o sí, no depende de que el handler se acuerde.
   */
  'app:openExternal': {
    input: z.object({
      url: z
        .url()
        .refine((value) => value.startsWith('https://'), 'Solo se permiten URLs https'),
    }),
    output: z.void(),
  },

  'window:minimize': { input: z.void(), output: z.void() },
  'window:toggleMaximize': { input: z.void(), output: z.boolean() },
  'window:close': { input: z.void(), output: z.void() },
  'window:isMaximized': { input: z.void(), output: z.boolean() },
  'window:toggleFullscreen': { input: z.void(), output: z.boolean() },

  'settings:getAll': {
    input: z.void(),
    output: settingsSchema,
  },

  /**
   * Actualización parcial: se envían solo las claves que cambian y se devuelve
   * el estado completo resultante. Devolver el objeto entero evita que el
   * renderer tenga que adivinar cómo quedó todo tras la escritura.
   */
  'settings:update': {
    input: settingsSchema.partial(),
    output: settingsSchema,
  },

  'settings:reset': {
    input: z.void(),
    output: settingsSchema,
  },

  /** Diagnóstico de la base de datos. Alimenta Configuración → Base de datos. */
  'db:status': {
    input: z.void(),
    output: databaseStatusSchema,
  },

  /**
   * Estado de los proveedores. Ojo con lo que NO está aquí: la salida no
   * contiene ninguna clave de API, solo una máscara calculada en el main.
   */
  'providers:list': {
    input: z.void(),
    output: z.array(providerSummarySchema),
  },

  'providers:setCredential': {
    input: z.object({
      provider: z.string().min(1).max(64),
      apiKey: z.string().min(1).max(512),
    }),
    output: z.void(),
  },

  'providers:removeCredential': {
    input: z.object({ provider: z.string().min(1).max(64) }),
    output: z.void(),
  },

  'providers:setConfig': {
    input: z.object({
      provider: z.string().min(1).max(64),
      enabled: z.boolean().optional(),
      priority: z.number().int().min(0).max(1000).optional(),
    }),
    output: z.void(),
  },

  /**
   * Comprueba que la credencial de un proveedor funciona de verdad, haciendo
   * una llamada real y barata. Guardar una clave y que sea inválida es un fallo
   * que conviene descubrir al pegarla, no al abrir un panel.
   */
  'providers:test': {
    input: z.object({ provider: z.string().min(1).max(64) }),
    output: z.object({ ok: z.boolean(), message: z.string() }),
  },

  /** Qué funciones están disponibles, degradadas o no disponibles, y por qué. */
  'providers:capabilities': {
    input: z.void(),
    output: z.array(capabilityStatusSchema),
  },

  'layouts:list': { input: z.void(), output: z.array(layoutSummarySchema) },
  'layouts:get': { input: z.object({ id: z.string() }), output: layoutRecordSchema.nullable() },
  'layouts:save': {
    input: z.object({
      name: z.string().min(1).max(64),
      // Serialización opaca de dockview: se guarda tal cual y se devuelve tal
      // cual. Solo se acota el tamaño para que un estado corrupto no llene la
      // base de datos.
      state: z.string().min(2).max(1_000_000),
    }),
    output: layoutRecordSchema,
  },
  'layouts:rename': {
    input: z.object({ id: z.string(), name: z.string().min(1).max(64) }),
    output: z.void(),
  },
  'layouts:delete': { input: z.object({ id: z.string() }), output: z.void() },
  'layouts:setDefault': { input: z.object({ id: z.string() }), output: z.void() },
  'layouts:getDefault': { input: z.void(), output: layoutRecordSchema.nullable() },

  'watchlists:list': { input: z.void(), output: z.array(watchlistSchema) },
  'watchlists:create': {
    input: z.object({ name: z.string().min(1).max(64), color: z.string().nullable().optional() }),
    output: watchlistSchema,
  },
  'watchlists:rename': {
    input: z.object({ id: z.string(), name: z.string().min(1).max(64) }),
    output: z.void(),
  },
  'watchlists:delete': { input: z.object({ id: z.string() }), output: z.void() },
  'watchlists:addItem': {
    input: z.object({ watchlistId: z.string(), symbol: symbolSchema, assetClass: assetClassSchema }),
    output: watchlistItemSchema,
  },
  'watchlists:removeItem': { input: z.object({ itemId: z.string() }), output: z.void() },
  'watchlists:updateItem': {
    input: z.object({
      itemId: z.string(),
      note: z.string().max(500).nullable().optional(),
      color: z.string().max(16).nullable().optional(),
    }),
    output: z.void(),
  },
  'watchlists:reorder': {
    input: z.object({ orderedIds: z.array(z.string()) }),
    output: z.void(),
  },

  'favorites:list': { input: z.void(), output: z.array(favoriteSchema) },
  'news:bookmarks': { input: z.void(), output: z.array(newsBookmarkSchema) },
  'news:toggleBookmark': {
    input: newsItemSchema,
    output: z.object({ saved: z.boolean() }),
  },
  'news:bookmarkedIds': { input: z.void(), output: z.array(z.string()) },

  'favorites:toggle': {
    input: z.object({ symbol: symbolSchema, assetClass: assetClassSchema }),
    output: z.object({ isFavorite: z.boolean() }),
  },

  'market:quote': { input: quoteQuerySchema, output: quoteSchema },
  'market:search': { input: searchQuerySchema, output: z.array(instrumentSchema) },
  'market:news': { input: newsQuerySchema, output: z.array(newsItemSchema) },
  'market:historical': { input: historicalQuerySchema, output: candleSeriesSchema },
  'market:profile': { input: quoteQuerySchema, output: companyProfileSchema },
  'market:cryptoMetrics': { input: quoteQuerySchema, output: cryptoMetricsSchema },
  'market:calendar': { input: calendarQuerySchema, output: z.array(calendarEventSchema) },
  'market:screener': { input: screenerQuerySchema, output: z.array(screenerRowSchema) },

  /**
   * Suscripción a cotizaciones en vivo.
   *
   * Se suscribe por lotes y no de uno en uno porque una watchlist con veinte
   * símbolos haría veinte viajes por el IPC al montarse.
   *
   * Devuelve qué símbolos se aceptaron: no todos admiten tiempo real (los
   * índices no cotizan como tal, y divisas y materias primas requieren plan de
   * pago). La interfaz necesita saberlo para no prometer algo que no llegará.
   */
  'market:subscribe': {
    input: z.object({ symbols: z.array(symbolSchema).min(1).max(100) }),
    output: z.object({ accepted: z.array(symbolSchema) }),
  },

  'market:unsubscribe': {
    input: z.object({ symbols: z.array(symbolSchema).min(1).max(100) }),
    output: z.void(),
  },

  'market:streamStatus': {
    input: z.void(),
    output: streamStatusSchema,
  },

  // ─── Portafolio ───────────────────────────────────────────────────────────

  'portfolio:list': { input: z.void(), output: z.array(portfolioAccountSchema) },

  'portfolio:create': {
    input: z.object({
      name: z.string().trim().min(1).max(60),
      currency: currencySchema.default('USD'),
    }),
    output: portfolioAccountSchema,
  },

  'portfolio:rename': {
    input: z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(60) }),
    output: portfolioAccountSchema,
  },

  'portfolio:delete': { input: z.object({ id: z.string().min(1) }), output: z.void() },

  'portfolio:transactions': {
    input: z.object({
      portfolioId: z.string().min(1),
      symbol: symbolSchema.nullable().default(null),
    }),
    output: z.array(transactionSchema),
  },

  'portfolio:addTransaction': {
    input: transactionInputSchema,
    output: transactionSchema,
  },

  'portfolio:deleteTransaction': {
    input: z.object({ id: z.string().min(1) }),
    output: z.void(),
  },

  /**
   * Posiciones derivadas, **sin precio de mercado**.
   *
   * El precio lo pone el renderer con las cotizaciones que ya tiene en caché:
   * así el valor de la cartera se mueve con los ticks del WebSocket en lugar de
   * exigir una ronda de peticiones propia cada vez que se abre la pantalla.
   */
  'portfolio:positions': {
    input: z.object({ portfolioId: z.string().min(1) }),
    output: z.array(positionSchema),
  },

  'portfolio:dividends': {
    input: z.object({ portfolioId: z.string().min(1) }),
    output: z.array(dividendSchema),
  },

  'portfolio:addDividend': {
    input: dividendInputSchema,
    output: dividendSchema,
  },

  'portfolio:deleteDividend': {
    input: z.object({ id: z.string().min(1) }),
    output: z.void(),
  },

  // ─── Alertas ──────────────────────────────────────────────────────────────

  'alerts:list': { input: z.void(), output: z.array(alertSchema) },

  /**
   * Crea una alerta y dice si su condición **ya se cumplía**.
   *
   * Hace falta decirlo porque el motor dispara al cruzar, no al estar: una
   * alerta de «por encima de 200» creada con el precio ya en 300 queda armada y
   * en silencio hasta que baje y vuelva a subir. Sin este aviso, el usuario se
   * queda esperando una notificación que no va a llegar y que además sería
   * correcta que no llegara.
   */
  'alerts:create': {
    input: alertInputSchema,
    output: z.object({
      alert: alertSchema,
      /** `null` si no se pudo consultar el valor actual. */
      alreadySatisfied: z.boolean().nullable(),
      currentValue: z.number().nullable(),
    }),
  },

  'alerts:setEnabled': {
    input: z.object({ id: z.string().min(1), enabled: z.boolean() }),
    output: alertSchema,
  },

  'alerts:delete': { input: z.object({ id: z.string().min(1) }), output: z.void() },

  'alerts:triggers': {
    input: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
    output: z.array(alertTriggerSchema),
  },

  'alerts:acknowledge': { input: z.object({ id: z.string().min(1) }), output: z.void() },
  'alerts:acknowledgeAll': { input: z.void(), output: z.void() },

  /**
   * Qué puede hacer de verdad el motor de alertas ahora mismo.
   *
   * Lo consulta la pantalla para explicar, por ejemplo, que sin proveedor de
   * cotizaciones configurado las alertas se guardan pero nunca se evaluarán.
   * Prometer vigilancia que no existe es la peor forma de fallar aquí.
   */
  'alerts:capabilities': {
    input: z.void(),
    output: z.object({
      /** Si hay algún proveedor capaz de dar cotizaciones. */
      canEvaluate: z.boolean(),
      /** Si el sistema operativo admite notificaciones de escritorio. */
      canNotify: z.boolean(),
      /** Cada cuánto se comprueban las alertas, en milisegundos. */
      pollIntervalMs: z.number().int(),
      /** Si el flujo en vivo está conectado y acelera los avisos de precio. */
      streaming: z.boolean(),
    }),
  },
  // `satisfies Record<IpcChannelName, …>` es lo que mantiene sincronizados el
  // contrato y la lista de canales sin zod: falta un canal → error; sobra un
  // canal que no está en la lista → error.
} as const satisfies Record<IpcChannelName, ChannelDefinition>

export type IpcContract = typeof ipcContract
export type IpcChannel = keyof IpcContract

export type IpcInput<K extends IpcChannel> = z.infer<IpcContract[K]['input']>
export type IpcOutput<K extends IpcChannel> = z.infer<IpcContract[K]['output']>

export const IPC_CHANNELS = IPC_CHANNEL_NAMES

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Eventos push (main → renderer)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Canal separado del request/response porque el flujo es al revés y la vida
 * del dato es distinta: aquí es donde entrarán los ticks de WebSocket, los
 * disparos de alerta y los cambios de estado de proveedor.
 */
export const ipcEvents = {
  /** La ventana se maximizó o se restauró. Lo necesita la barra de título propia. */
  'window:maximizedChanged': z.boolean(),

  /**
   * Lote de cotizaciones en vivo.
   *
   * Llega agrupado, no operación a operación: una acción líquida genera cientos
   * de operaciones por segundo y reenviarlas una a una saturaría el puente y
   * provocaría una tormenta de repintados para mostrar un precio que el ojo no
   * distingue.
   */
  'market:ticks': z.array(tickSchema),

  /** Estado de la conexión en vivo, para poder indicarlo en la interfaz. */
  'market:streamStatus': streamStatusSchema,

  /**
   * Una alerta acaba de dispararse.
   *
   * Va por push y no por sondeo porque el disparo lo detecta el proceso
   * principal, que es quien vigila las cotizaciones. Si el renderer tuviera que
   * preguntar, el aviso llegaría con el retraso del intervalo de sondeo, que es
   * justo lo que una alerta no puede permitirse.
   */
  'alerts:triggered': alertTriggerSchema,
} as const satisfies Record<IpcEventName, z.ZodType>

export type IpcEvents = typeof ipcEvents
export type IpcEventPayload<E extends IpcEventName> = z.infer<IpcEvents[E]>

export type { IpcChannelName, IpcEventName }
export { IPC_EVENT_NAMES }
