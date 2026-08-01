import {
  getStreamStatus,
  subscribeSymbol,
  unsubscribeSymbol,
} from '../../realtime'
import type { IpcHandler } from '../register'

/**
 * Suscripción a cotizaciones en vivo.
 *
 * Se devuelve la lista de símbolos **aceptados**, no un simple `ok`: los
 * índices no cotizan como tal y las divisas requieren plan de pago, así que
 * pedir tiempo real para `^GSPC` es legítimo pero no va a producir nada. La
 * interfaz necesita distinguir «suscrito» de «no llegará» para no prometer un
 * precio en vivo que nunca se moverá.
 */
export const subscribe: IpcHandler<'market:subscribe'> = ({ symbols }) => ({
  accepted: symbols.filter((symbol) => subscribeSymbol(symbol)),
})

export const unsubscribe: IpcHandler<'market:unsubscribe'> = ({ symbols }) => {
  for (const symbol of symbols) unsubscribeSymbol(symbol)
}

export const streamStatus: IpcHandler<'market:streamStatus'> = () => getStreamStatus()
