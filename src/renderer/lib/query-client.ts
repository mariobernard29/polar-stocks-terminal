import { QueryClient } from '@tanstack/react-query'
import { PolarError } from '@shared/ipc/errors'

/**
 * Cliente de TanStack Query.
 *
 * Frontera deliberada con Zustand: aquí vive **todo** lo que viene del proceso
 * main (cotizaciones, noticias, ajustes) y nada de estado de interfaz. Mezclar
 * ambos es la causa más común de datos obsoletos en aplicaciones de este tipo.
 *
 * La política de reintentos usa el `retryable` que viaja en nuestros errores:
 * reintentar una validación fallida o una credencial ausente es puro ruido, y
 * además ruido que consume cuota.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof PolarError && !error.retryable) return false
          return failureCount < 2
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // Los datos de mercado se refrescan por sus propios intervalos; volver a
        // pedirlo todo cada vez que la ventana recupera el foco gastaría cuota
        // sin aportar nada.
        refetchOnWindowFocus: false,
        staleTime: 5_000,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
