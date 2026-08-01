import type { AssetClass } from '@shared/domain'

/**
 * Catálogo de instrumentos simulados.
 *
 * Cubre a propósito las seis clases de activo que la terminal soporta, para que
 * el buscador, las watchlists y los paneles se puedan ejercitar con casos
 * variados —precios de cuatro cifras, precios por debajo de un céntimo,
 * índices sin volumen— y no solo con acciones estadounidenses.
 */
export interface CatalogEntry {
  readonly symbol: string
  readonly name: string
  readonly assetClass: AssetClass
  readonly exchange: string | null
  readonly currency: string
  readonly basePrice: number
  readonly baseVolume: number
}

export const CATALOG: readonly CatalogEntry[] = [
  // Acciones
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD', basePrice: 232.4, baseVolume: 54_000_000 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD', basePrice: 428.9, baseVolume: 21_000_000 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD', basePrice: 178.2, baseVolume: 240_000_000 },
  { symbol: 'TSLA', name: 'Tesla, Inc.', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD', basePrice: 341.7, baseVolume: 92_000_000 },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD', basePrice: 219.6, baseVolume: 38_000_000 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD', basePrice: 196.3, baseVolume: 27_000_000 },
  { symbol: 'META', name: 'Meta Platforms, Inc.', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD', basePrice: 612.8, baseVolume: 14_000_000 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', assetClass: 'stock', exchange: 'NYSE', currency: 'USD', basePrice: 248.1, baseVolume: 9_000_000 },
  { symbol: 'SAN', name: 'Banco Santander, S.A.', assetClass: 'stock', exchange: 'BME', currency: 'EUR', basePrice: 6.42, baseVolume: 41_000_000 },
  { symbol: 'ITX', name: 'Industria de Diseño Textil, S.A.', assetClass: 'stock', exchange: 'BME', currency: 'EUR', basePrice: 52.3, baseVolume: 3_100_000 },

  // ETFs
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', assetClass: 'etf', exchange: 'NYSE', currency: 'USD', basePrice: 598.4, baseVolume: 68_000_000 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', assetClass: 'etf', exchange: 'NASDAQ', currency: 'USD', basePrice: 521.9, baseVolume: 41_000_000 },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'etf', exchange: 'NYSE', currency: 'USD', basePrice: 296.7, baseVolume: 4_200_000 },

  // Índices — sin volumen real, prueban el caso `volume: null` en la interfaz
  { symbol: '^GSPC', name: 'S&P 500', assetClass: 'index', exchange: null, currency: 'USD', basePrice: 5980.2, baseVolume: 0 },
  { symbol: '^IXIC', name: 'NASDAQ Composite', assetClass: 'index', exchange: null, currency: 'USD', basePrice: 19_640.5, baseVolume: 0 },
  { symbol: '^IBEX', name: 'IBEX 35', assetClass: 'index', exchange: null, currency: 'EUR', basePrice: 11_820.4, baseVolume: 0 },

  // Criptomonedas — incluyen precios muy pequeños, que rompen formateadores ingenuos
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', exchange: null, currency: 'USD', basePrice: 97_420.0, baseVolume: 38_000 },
  { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', exchange: null, currency: 'USD', basePrice: 3_412.7, baseVolume: 410_000 },
  { symbol: 'SOL', name: 'Solana', assetClass: 'crypto', exchange: null, currency: 'USD', basePrice: 214.6, baseVolume: 2_900_000 },
  { symbol: 'DOGE', name: 'Dogecoin', assetClass: 'crypto', exchange: null, currency: 'USD', basePrice: 0.3812, baseVolume: 940_000_000 },
  { symbol: 'SHIB', name: 'Shiba Inu', assetClass: 'crypto', exchange: null, currency: 'USD', basePrice: 0.000021, baseVolume: 12_000_000_000 },

  // Forex
  { symbol: 'EURUSD', name: 'Euro / Dólar estadounidense', assetClass: 'forex', exchange: null, currency: 'USD', basePrice: 1.0842, baseVolume: 0 },
  { symbol: 'USDJPY', name: 'Dólar estadounidense / Yen japonés', assetClass: 'forex', exchange: null, currency: 'JPY', basePrice: 154.28, baseVolume: 0 },
  { symbol: 'GBPUSD', name: 'Libra esterlina / Dólar estadounidense', assetClass: 'forex', exchange: null, currency: 'USD', basePrice: 1.2634, baseVolume: 0 },

  // Materias primas
  { symbol: 'XAUUSD', name: 'Oro (onza troy)', assetClass: 'commodity', exchange: null, currency: 'USD', basePrice: 2_684.3, baseVolume: 0 },
  { symbol: 'XAGUSD', name: 'Plata (onza troy)', assetClass: 'commodity', exchange: null, currency: 'USD', basePrice: 31.42, baseVolume: 0 },
  { symbol: 'WTI', name: 'Petróleo West Texas Intermediate', assetClass: 'commodity', exchange: null, currency: 'USD', basePrice: 71.85, baseVolume: 0 },
]
