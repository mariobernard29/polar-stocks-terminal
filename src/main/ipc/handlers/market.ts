import { getRegistry } from '../../providers'
import type { IpcHandler } from '../register'

/**
 * Datos de mercado.
 *
 * Los handlers son deliberadamente finos: el contrato ya validó la entrada y el
 * registro se encarga de caché, cuota y failover. Aquí no hay lógica que pueda
 * divergir entre capacidades.
 */

export const quote: IpcHandler<'market:quote'> = (query) => getRegistry().execute('quote', query)

export const search: IpcHandler<'market:search'> = async (query) => [
  ...(await getRegistry().execute('search', query)),
]

export const news: IpcHandler<'market:news'> = async (query) => [
  ...(await getRegistry().execute('news', query)),
]

export const historical: IpcHandler<'market:historical'> = (query) =>
  getRegistry().execute('historical', query)

export const profile: IpcHandler<'market:profile'> = (query) =>
  getRegistry().execute('profile', query)

export const cryptoMetrics: IpcHandler<'market:cryptoMetrics'> = (query) =>
  getRegistry().execute('cryptoMetrics', query)

export const calendar: IpcHandler<'market:calendar'> = async (query) => [
  ...(await getRegistry().execute('earningsCalendar', query)),
]

export const screener: IpcHandler<'market:screener'> = async (query) => [
  ...(await getRegistry().execute('screener', query)),
]
