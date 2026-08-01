import { useEffect, useState } from 'react'

/**
 * Retrasa un valor hasta que deja de cambiar durante `delay` ms.
 *
 * En el buscador esto es lo que separa una consulta por pulsación de una
 * consulta por palabra: escribir «santander» son nueve teclas, y sin esto serían
 * nueve llamadas al proveedor — nueve fichas de la cuota para un único
 * resultado.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
