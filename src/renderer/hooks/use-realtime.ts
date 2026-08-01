import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Quote } from '@shared/domain'
import type { StreamStatus, Tick } from '@shared/ipc/contract'
import { ipc, on } from '../lib/ipc'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Cotizaciones en vivo
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Los ticks **no crean estado nuevo**: actualizan la cotización que ya está en
 * la caché de TanStack Query. Es la decisión importante de este módulo.
 *
 * La alternativa —guardar los precios en vivo en un store aparte— obligaría a
 * cada componente a decidir cuál de las dos fuentes mostrar, y tarde o temprano
 * dos partes de la pantalla enseñarían precios distintos del mismo activo. Con
 * una sola fuente, un panel que ya sabe pintar una `Quote` se vuelve tiempo real
 * sin cambiar una línea.
 */

/** Instancia única: evita crear un `Set` nuevo en cada render. */
const EMPTY_SET: ReadonlySet<string> = new Set()

/** Aplica un tick sobre la cotización cacheada, conservando el resto de campos. */
function applyTick(previous: Quote | undefined, tick: Tick): Quote | undefined {
  if (!previous) return previous

  // La variación se recalcula contra el cierre anterior, que no cambia durante
  // la sesión. Sin esto, el precio se movería pero el porcentaje se quedaría
  // congelado en el de la última consulta REST.
  const previousClose = previous.previousClose
  const change = previousClose !== null ? tick.price - previousClose : previous.change
  const changePercent =
    previousClose !== null && previousClose !== 0
      ? (change / previousClose) * 100
      : previous.changePercent

  return {
    ...previous,
    price: tick.price,
    change,
    changePercent,
    // El máximo y el mínimo del día se amplían si el tick los supera: dejarlos
    // fijos mostraría un precio actual fuera de su propio rango.
    dayHigh: previous.dayHigh !== null ? Math.max(previous.dayHigh, tick.price) : null,
    dayLow: previous.dayLow !== null ? Math.min(previous.dayLow, tick.price) : null,
    timestamp: tick.timestamp,
  }
}

/**
 * Suscribe un conjunto de símbolos mientras el componente esté montado.
 *
 * Devuelve los símbolos que **de verdad** admiten tiempo real: los índices no
 * cotizan como tal y las divisas requieren plan de pago, así que la interfaz
 * puede distinguir «en vivo» de «se actualiza al refrescar».
 */
export function useRealtimeQuotes(symbols: readonly string[]): {
  liveSymbols: ReadonlySet<string>
  status: StreamStatus
} {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StreamStatus>('closed')

  // Clave estable: sin ella, un array nuevo en cada render reabriría la
  // suscripción constantemente.
  const key = [...symbols].sort().join(',')

  /**
   * La respuesta se guarda **junto a la clave que la produjo**.
   *
   * Así, al cambiar los símbolos, el conjunto anterior deja de aplicarse por
   * simple derivación en vez de limpiarlo desde un efecto — que sincronizar
   * estado con estado es justo lo que conviene evitar. Y de paso desaparece la
   * ventana en la que se mostrarían como «en vivo» símbolos de la suscripción
   * anterior.
   */
  const [resolved, setResolved] = useState<{ key: string; symbols: ReadonlySet<string> }>({
    key: '',
    symbols: EMPTY_SET,
  })

  const liveSymbols = resolved.key === key ? resolved.symbols : EMPTY_SET

  useEffect(() => {
    const list = key.length > 0 ? key.split(',') : []
    if (list.length === 0) return

    let cancelled = false

    void ipc.market.subscribe(list).then(({ accepted }) => {
      if (!cancelled) setResolved({ key, symbols: new Set(accepted) })
    })

    return () => {
      cancelled = true
      void ipc.market.unsubscribe(list)
    }
  }, [key])

  useEffect(() => {
    void ipc.market.streamStatus().then(setStatus)
    return on('market:streamStatus', setStatus)
  }, [])

  useEffect(() => {
    return on('market:ticks', (ticks) => {
      for (const tick of ticks) {
        queryClient.setQueryData<Quote>(['quote', tick.symbol], (previous) =>
          applyTick(previous, tick),
        )
      }
    })
  }, [queryClient])

  return { liveSymbols, status }
}
