import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { Quote } from '@shared/domain'
import {
  summarize,
  withMarketValue,
  type PortfolioSummary,
  type PositionWithMarket,
} from '@shared/portfolio/positions'
import { useRealtimeQuotes } from '../../hooks/use-realtime'
import { ipc } from '../../lib/ipc'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Datos del portafolio
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Junta las posiciones (que vienen del proceso principal sin precio) con las
 * cotizaciones (que ya están en la caché de TanStack Query y las alimenta el
 * WebSocket). El resultado es que la cartera se revaloriza sola con cada tick,
 * sin una sola petición extra.
 *
 * El cálculo se hace aquí y no en el main precisamente por eso: si el main
 * devolviera el valor de mercado ya sumado, habría que volver a pedirlo entero
 * cada vez que se moviera un precio.
 */

export interface PortfolioView {
  readonly positions: readonly (PositionWithMarket & { assetClass: string })[]
  readonly summary: PortfolioSummary
  readonly isLoading: boolean
  /** Símbolos cuya cotización no se pudo obtener. La interfaz lo advierte. */
  readonly missingPrices: readonly string[]
}

export function usePortfolio(portfolioId: string | undefined): PortfolioView {
  const positions = useQuery({
    queryKey: ['portfolio', 'positions', portfolioId],
    queryFn: () => ipc.portfolio.positions(portfolioId ?? ''),
    enabled: Boolean(portfolioId),
  })

  const dividends = useQuery({
    queryKey: ['portfolio', 'dividends', portfolioId],
    queryFn: () => ipc.portfolio.dividends(portfolioId ?? ''),
    enabled: Boolean(portfolioId),
  })

  // Solo se cotizan las posiciones abiertas: pedir el precio de algo que se
  // vendió hace un año gasta cuota para un dato que no se muestra.
  const openSymbols = useMemo(
    () => (positions.data ?? []).filter((row) => row.quantity > 0).map((row) => row.symbol),
    [positions.data],
  )

  useRealtimeQuotes(openSymbols)

  const quotes = useQueries({
    queries: openSymbols.map((symbol) => ({
      queryKey: ['quote', symbol],
      queryFn: () => ipc.market.quote(symbol),
      // La misma clave que usa el resto de la aplicación: si el panel de un
      // activo ya lo pidió, esto no genera una segunda llamada.
      refetchInterval: 60_000,
      retry: false,
    })),
  })

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number | null>()
    openSymbols.forEach((symbol, index) => {
      const quote = quotes[index]?.data as Quote | undefined
      map.set(symbol, quote?.price ?? null)
    })
    return map
  }, [openSymbols, quotes])

  const view = useMemo(() => {
    const rows = (positions.data ?? []).map((position) => ({
      ...withMarketValue(position, priceBySymbol.get(position.symbol) ?? null),
      assetClass: position.assetClass,
    }))

    const netDividends = (dividends.data ?? []).reduce(
      (total, row) => total + (row.amount - row.withholding),
      0,
    )

    return {
      rows,
      summary: summarize(rows, netDividends),
      missing: rows
        .filter((row) => row.quantity > 0 && row.price === null)
        .map((row) => row.symbol),
    }
  }, [positions.data, dividends.data, priceBySymbol])

  return {
    positions: view.rows,
    summary: view.summary,
    isLoading: positions.isLoading,
    missingPrices: view.missing,
  }
}
