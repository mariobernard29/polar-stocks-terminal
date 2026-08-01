import type {
  Capability,
  CandleSeries,
  CalendarEvent,
  CalendarQuery,
  CompanyProfile,
  ScreenerQuery,
  ScreenerRow,
  CryptoMetrics,
  Instrument,
  NewsItem,
  Quote,
} from '@shared/domain'
import type {
  HistoricalQuery,
  NewsQuery,
  QuoteQuery,
  SearchQuery,
} from '@shared/domain/queries'
import type { RateLimiterOptions } from '../cache/rate-limiter'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato de proveedor de datos
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La aplicación nunca se programa contra "Finnhub" o "Polygon", sino contra
 * capacidades. Un proveedor es una bolsa de métodos: la que implementa, la
 * ofrece.
 *
 * Detalle importante: las capacidades **se derivan** de los métodos presentes,
 * no se declaran aparte. Un proveedor no puede decir que sabe dar noticias y no
 * implementar `news` — no hay dónde mentir.
 */

/**
 * Firma de cada capacidad implementable.
 *
 * Las capacidades del dominio que aún no tienen método (screeners, calendarios,
 * métricas de cripto…) sencillamente no aparecen aquí, y el registro las
 * reporta como no disponibles. Es honesto: prefiero que la interfaz diga "no
 * disponible" a que finja.
 */
export interface CapabilityMethods {
  quote: (query: QuoteQuery) => Promise<Quote>
  cryptoQuote: (query: QuoteQuery) => Promise<Quote>
  search: (query: SearchQuery) => Promise<readonly Instrument[]>
  news: (query: NewsQuery) => Promise<readonly NewsItem[]>
  historical: (query: HistoricalQuery) => Promise<CandleSeries>
  profile: (query: QuoteQuery) => Promise<CompanyProfile>
  cryptoMetrics: (query: QuoteQuery) => Promise<CryptoMetrics>
  earningsCalendar: (query: CalendarQuery) => Promise<readonly CalendarEvent[]>
  screener: (query: ScreenerQuery) => Promise<readonly ScreenerRow[]>
}

export type ImplementedCapability = keyof CapabilityMethods

// Garantiza que toda capacidad implementable existe en el dominio. Si alguien
// añade una clave con un nombre que no está en `Capability`, esto no compila.
type _AssertSubset = ImplementedCapability extends Capability ? true : never
const _assertSubset: _AssertSubset = true
void _assertSubset

export interface ProviderDescriptor {
  /** Identificador estable. Se usa como clave de credencial y de caché. */
  readonly id: string
  readonly displayName: string
  /** Si es falso, el proveedor funciona sin que el usuario configure nada. */
  readonly requiresApiKey: boolean
  /** Límite del plan. Cada proveedor y cada plan traen el suyo. */
  readonly rateLimit: RateLimiterOptions
  /** Dónde consigue el usuario la clave. Se enlaza desde Configuración. */
  readonly docsUrl: string | null

  /**
   * Proveedor de último recurso: solo atiende cuando ningún otro puede.
   *
   * Existe por un fallo real. El proveedor simulado tenía una fila en la base de
   * datos con prioridad 100 —residuo de haber guardado y borrado una credencial
   * de prueba— y eso lo colocaba por delante de FMP. Resultado: el S&P 500 se
   * mostraba a 5.926 (simulado) cuando el valor real era 7.489. Un dato
   * inventado presentado como real, por una fila olvidada.
   *
   * La prioridad numérica no basta para expresar «esto va siempre al final»,
   * porque cualquiera puede cambiarla desde Configuración. Este flag sí: el
   * registro ordena los de respaldo detrás de todos los demás, pase lo que pase.
   */
  readonly isFallback?: boolean

  /**
   * Ajuste de prioridad por capacidad, sumado a la prioridad que fija el usuario.
   *
   * Un único número por proveedor no basta: FMP da la mejor ficha de empresa
   * (sector, consejero delegado, PER, descripción) pero su plan gratuito son
   * unas 250 peticiones **al día**, así que servir cotizaciones con él agotaría
   * la cuota en minutos. Finnhub es al revés: 60 llamadas por minuto pero una
   * ficha pobre.
   *
   * Con este ajuste cada proveedor se coloca donde es bueno sin dejar de
   * respetar el orden que haya elegido el usuario, porque se **suma** a él en
   * vez de sustituirlo.
   */
  readonly capabilityPriorityOffset?: Partial<Record<ImplementedCapability, number>>
}

export interface MarketDataProvider extends ProviderDescriptor {
  readonly methods: Readonly<Partial<CapabilityMethods>>

  /**
   * Filtro previo y barato: ¿este proveedor puede atender **esta** consulta?
   *
   * Existe porque implementar una capacidad no significa poder servir cualquier
   * símbolo: CoinGecko implementa `quote` pero solo para cripto, y Finnhub solo
   * para renta variable. Sin este filtro, el registro gastaría una ficha de
   * cuota en una petición que el proveedor iba a rechazar de todas formas — y
   * la cuota es justo el recurso escaso.
   *
   * Si no se define, se asume que el proveedor acepta cualquier consulta de las
   * capacidades que implementa.
   */
  readonly supports?: (capability: ImplementedCapability, query: unknown) => boolean
}

/** Capacidades que un proveedor ofrece de verdad, deducidas de sus métodos. */
export function capabilitiesOf(provider: MarketDataProvider): ReadonlySet<ImplementedCapability> {
  const found = new Set<ImplementedCapability>()
  for (const [key, value] of Object.entries(provider.methods)) {
    if (typeof value === 'function') found.add(key as ImplementedCapability)
  }
  return found
}

/**
 * Cuánto vive en caché el resultado de cada capacidad.
 *
 * Una cotización a 5 segundos sigue siendo útil y ahorra la mayoría de las
 * llamadas; un histórico diario no cambia en una hora. Estos números son la
 * diferencia entre agotar la cuota antes de comer o no agotarla.
 */
/**
 * Capacidades en las que una lista vacía **no** cuenta como respuesta.
 *
 * Para una cotización, «no hay dato» es una respuesta legítima. Para las
 * noticias no: que un proveedor no tenga nada de un símbolo no significa que no
 * haya noticias, sino que ese índice concreto no las cubre.
 */
export const EMPTY_MEANS_NO_ANSWER: ReadonlySet<ImplementedCapability> = new Set<
  ImplementedCapability
>(['news'])

/**
 * Capacidades cuyos resultados se **unen** en lugar de tomar el primero.
 *
 * La búsqueda es el caso claro. Con la estrategia de «el primero que conteste
 * gana», buscar «bitcoin» devolvía GBTC, PXPC y ABTC —ETFs que Finnhub sí tiene
 * indexados— y nunca llegaba a CoinGecko, así que **Bitcoin no aparecía**. Cada
 * proveedor conoce su parcela: Finnhub la renta variable estadounidense,
 * CoinGecko las criptomonedas. Un buscador universal tiene que preguntar a
 * todos y juntar.
 */
export const MERGED_CAPABILITIES: ReadonlySet<ImplementedCapability> = new Set<
  ImplementedCapability
>(['search', 'earningsCalendar'])

export const CAPABILITY_TTL_MS: Readonly<Record<ImplementedCapability, number>> = {
  quote: 5_000,
  cryptoQuote: 5_000,
  search: 300_000,
  news: 60_000,
  historical: 3_600_000,
  // El perfil de una empresa no cambia en horas.
  profile: 21_600_000,
  // Supply y dominancia se mueven despacio; 5 minutos sobra.
  cryptoMetrics: 300_000,
  // El calendario corporativo se publica con días de antelación.
  earningsCalendar: 1_800_000,
  // Los movimientos del día cambian durante la sesión, pero no cada segundo.
  screener: 60_000,
}
