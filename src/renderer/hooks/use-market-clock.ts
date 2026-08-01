import { useEffect, useState } from 'react'
import { getSessionInfo, type SessionInfo } from '@shared/market/session'

export interface MarketClock {
  now: Date
  session: SessionInfo
}

/**
 * Reloj de la barra superior.
 *
 * Un único intervalo compartido por el hook: si cada componente que muestra la
 * hora creara el suyo, la aplicación despertaría al procesador varias veces por
 * segundo sin necesidad.
 *
 * El estado de sesión se recalcula en cada tick a propósito. Es barato, y así
 * la transición de "pre-apertura" a "abierto" ocurre sola a las 9:30 sin lógica
 * de temporizadores especiales.
 */
export function useMarketClock(): MarketClock {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return { now, session: getSessionInfo(now) }
}
