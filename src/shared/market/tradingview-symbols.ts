import { inferAssetClass } from './symbols'

/**
 * Traducción del símbolo canónico al que entiende TradingView.
 *
 * TradingView nombra los activos como `MERCADO:TICKER`. Sin prefijo suele
 * resolverlo por su cuenta, pero no siempre acierta con el mercado, y para
 * índices y cripto la notación es directamente distinta.
 *
 * Módulo puro y sin dependencias: es una tabla de traducción, y el tipo de cosa
 * que conviene tener probada porque su fallo es silencioso — el widget carga
 * igual y muestra «símbolo no encontrado» o, peor, otro activo.
 */

/** Índices: TradingView usa nombres propios, no el prefijo `^` de Yahoo. */
const INDEX_MAP: Readonly<Record<string, string>> = {
  '^GSPC': 'SP:SPX',
  '^IXIC': 'NASDAQ:IXIC',
  '^DJI': 'DJ:DJI',
  '^RUT': 'TVC:RUT',
  '^VIX': 'TVC:VIX',
  '^IBEX': 'BME:IBC',
  '^FTSE': 'TVC:UKX',
  '^GDAXI': 'XETR:DAX',
  '^FCHI': 'EURONEXT:PX1',
  '^N225': 'TVC:NI225',
  '^HSI': 'TVC:HSI',
  '^STOXX50E': 'TVC:SX5E',
}

/** Materias primas con su contrato o índice de referencia en TradingView. */
const COMMODITY_MAP: Readonly<Record<string, string>> = {
  XAUUSD: 'OANDA:XAUUSD',
  XAGUSD: 'OANDA:XAGUSD',
  XPTUSD: 'OANDA:XPTUSD',
  WTI: 'TVC:USOIL',
  BRENT: 'TVC:UKOIL',
  NATGAS: 'TVC:NATURALGAS',
  COPPER: 'COMEX:HG1!',
}

/**
 * Convierte un símbolo canónico al identificador de TradingView.
 *
 * Para acciones se devuelve sin prefijo de mercado a propósito: TradingView
 * resuelve bien los tickers estadounidenses y poner un mercado equivocado
 * (`NASDAQ:` en algo del NYSE) hace que el widget no encuentre nada. Cuando se
 * conoce el mercado, se puede pasar en `exchange` y sí se antepone.
 */
export function toTradingViewSymbol(symbol: string, exchange?: string | null): string {
  const upper = symbol.toUpperCase()

  const index = INDEX_MAP[upper]
  if (index) return index

  const commodity = COMMODITY_MAP[upper]
  if (commodity) return commodity

  switch (inferAssetClass(upper)) {
    case 'crypto':
      // El par contra Tether es el de mayor volumen y el que TradingView
      // muestra por defecto para casi todas las monedas.
      return `BINANCE:${upper}USDT`

    case 'forex':
      return `FX:${upper}`

    default: {
      const market = normalizeExchange(exchange)
      return market ? `${market}:${upper}` : upper
    }
  }
}

/**
 * Traduce el nombre de mercado que devuelve un proveedor al código de
 * TradingView. Devuelve `null` cuando no se reconoce, y entonces se prefiere no
 * poner prefijo antes que poner uno equivocado.
 */
function normalizeExchange(exchange: string | null | undefined): string | null {
  if (!exchange) return null
  const value = exchange.toUpperCase()

  if (value.includes('NASDAQ')) return 'NASDAQ'
  if (value.includes('NYSE ARCA') || value.includes('ARCA')) return 'AMEX'
  if (value.includes('NYSE')) return 'NYSE'
  if (value.includes('AMEX')) return 'AMEX'
  if (value.includes('BME') || value.includes('MADRID')) return 'BME'
  if (value.includes('XETRA')) return 'XETR'
  if (value.includes('LSE') || value.includes('LONDON')) return 'LSE'
  if (value.includes('EURONEXT')) return 'EURONEXT'
  if (value.includes('TSX')) return 'TSX'

  return null
}

/** Intervalos de TradingView. No coinciden con los nombres de la aplicación. */
const INTERVAL_MAP: Readonly<Record<string, string>> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1D': 'D',
  '1W': 'W',
  '1M': 'M',
}

export function toTradingViewInterval(timeframe: string): string {
  return INTERVAL_MAP[timeframe] ?? 'D'
}
