import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Une clases condicionales resolviendo conflictos de Tailwind.
 *
 * Sin `twMerge`, `cn('p-4', 'p-6')` dejaría ambas y ganaría la que el CSS
 * ordene, no la que el componente quiso. Es la base para que un componente
 * acepte `className` y de verdad pueda sobrescribir sus estilos.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
