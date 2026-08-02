import {
  extractSymbols,
  mentionsNews,
  mentionsPortfolio,
  type AiContext,
  type ContextNews,
  type ContextProfile,
  type ContextQuote,
} from '@shared/ai/context'
import { getSessionInfo } from '@shared/market/session'
import { listPortfolios, listPositions } from '../db/repositories/portfolio'
import { logger } from '../lib/logger'
import { getRegistry } from '../providers'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Recopilación del contexto
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La mitad impura de la estrategia anti-invención: ir a buscar de verdad los
 * datos antes de preguntarle nada al modelo.
 *
 * El orden importa. Primero se decide de qué habla la pregunta, luego se pide
 * **solo eso**. Cargar de oficio veinte símbolos «por si acaso» agotaría la
 * cuota del plan gratuito en unas pocas preguntas y llenaría el contexto de
 * ruido que empeora la respuesta.
 *
 * Nada de lo que falle aquí interrumpe la conversación: los fallos se anotan y
 * viajan al modelo, que puede decir «no pude consultar X» en lugar de callarse
 * o inventarlo.
 */

/** Titulares que se adjuntan. Suficiente para explicar un movimiento del día. */
const NEWS_LIMIT = 6

export interface ContextOptions {
  /** Símbolo abierto en la aplicación, si lo hay. No es una suposición. */
  readonly focusSymbol: string | null
}

export async function buildContext(
  question: string,
  options: ContextOptions,
): Promise<AiContext> {
  const failures: string[] = []
  const quotes: ContextQuote[] = []
  const profiles: ContextProfile[] = []
  let news: ContextNews[] = []
  let positions: AiContext['positions'] = null

  const symbols = extractSymbols(
    question,
    options.focusSymbol ? [options.focusSymbol] : [],
  )

  const registry = getRegistry()

  // Cotizaciones y perfiles en paralelo: son símbolos distintos y no dependen
  // unos de otros.
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const quote = await registry.execute('quote', { symbol })
        quotes.push({
          symbol,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          currency: quote.currency,
          previousClose: quote.previousClose,
          dayHigh: quote.dayHigh,
          dayLow: quote.dayLow,
          source: quote.source,
          at: quote.timestamp,
        })
      } catch (error) {
        failures.push(`No se pudo obtener la cotización de ${symbol}.`)
        logger.warn(`[ai] sin cotización para ${symbol}`, error)
      }
    }),
  )

  // El perfil solo para el símbolo principal. Es un dato estable y caro: pedir
  // el de cuatro símbolos en cada mensaje gastaría cuota para repetir siempre
  // lo mismo.
  const primary = symbols[0]
  if (primary !== undefined) {
    try {
      const profile = await registry.execute('profile', { symbol: primary })
      profiles.push({
        symbol: primary,
        name: profile.name,
        exchange: profile.exchange,
        industry: profile.industry,
        marketCap: profile.marketCap,
        source: profile.source,
      })
    } catch {
      // Sin nota de fallo: el perfil es un extra. Anotarlo daría a entender que
      // se pidió algo que el usuario echará en falta, y no es el caso.
    }
  }

  if (mentionsNews(question)) {
    try {
      const items = await registry.execute('news', {
        symbol: primary ?? null,
        category: null,
        limit: NEWS_LIMIT,
      })
      news = items.map((item) => ({
        headline: item.headline,
        source: item.source,
        publishedAt: item.publishedAt,
        symbols: item.symbols,
      }))
    } catch (error) {
      failures.push('No se pudieron obtener titulares de noticias.')
      logger.warn('[ai] sin noticias', error)
    }
  }

  if (mentionsPortfolio(question)) {
    try {
      const portfolios = await listPortfolios()
      const active = portfolios[0]
      if (active) {
        const rows = await listPositions(active.id)
        positions = rows
          .filter((row) => row.quantity > 0 || row.realizedPnl !== 0)
          .map((row) => ({
            symbol: row.symbol,
            quantity: row.quantity,
            averageCost: row.averageCost,
            costBasis: row.costBasis,
            realizedPnl: row.realizedPnl,
          }))
      } else {
        positions = []
      }
    } catch (error) {
      failures.push('No se pudo leer la cartera.')
      logger.warn('[ai] sin cartera', error)
    }
  }

  /*
   * Las posiciones llegan sin precio (ver el repositorio del portafolio), así
   * que se piden las cotizaciones que falten. Sin esto, preguntar «¿cómo va mi
   * cartera?» daría un contexto con el coste pero no con el valor actual, y el
   * modelo no podría responder a lo que se le pregunta.
   */
  if (positions !== null && positions.length > 0) {
    const known = new Set(quotes.map((quote) => quote.symbol))
    const missing = positions
      .filter((position) => position.quantity > 0 && !known.has(position.symbol))
      // Techo defensivo: una cartera de cuarenta valores no puede convertirse
      // en cuarenta llamadas por cada mensaje del chat.
      .slice(0, 10)

    await Promise.all(
      missing.map(async (position) => {
        try {
          const quote = await registry.execute('quote', { symbol: position.symbol })
          quotes.push({
            symbol: position.symbol,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            currency: quote.currency,
            previousClose: quote.previousClose,
            dayHigh: quote.dayHigh,
            dayLow: quote.dayLow,
            source: quote.source,
            at: quote.timestamp,
          })
        } catch {
          failures.push(`No se pudo obtener la cotización de ${position.symbol} (en cartera).`)
        }
      }),
    )
  }

  const now = Date.now()

  return {
    now,
    marketSession: getSessionInfo(new Date(now)).state,
    quotes,
    profiles,
    news,
    positions,
    failures,
  }
}
