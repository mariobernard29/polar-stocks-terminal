/**
 * Formateo sensible al idioma y a la escala.
 *
 * Dos motivos para centralizarlo:
 *
 *  1. `1.234,56` y `1,234.56` son el mismo número en idiomas distintos. En una
 *     herramienta financiera equivocarse aquí no es un detalle estético.
 *  2. Los activos abarcan diez órdenes de magnitud: SHIB vale 0,000021 y el
 *     Bitcoin 97.000. Un formato de dos decimales fijos mostraría SHIB como
 *     0,00, que es sencillamente un dato falso.
 *
 * Los `Intl.NumberFormat` se cachean porque crearlos es caro y una tabla de
 * cotizaciones los usa cientos de veces por repintado.
 */

const numberFormatters = new Map<string, Intl.NumberFormat>()

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  let cached = numberFormatters.get(key)
  if (!cached) {
    cached = new Intl.NumberFormat(locale, options)
    numberFormatters.set(key, cached)
  }
  return cached
}

/**
 * Decimales según la magnitud y, si se conoce, la clase de activo.
 *
 * El forex es el caso que obliga a mirar la clase y no solo el número: EURUSD
 * cotiza a 1,0842 y con dos decimales se convierte en 1,08, ocultando
 * exactamente la cifra donde se mueve ese mercado.
 */
export function decimalsFor(value: number, assetClass?: string): number {
  if (assetClass === 'forex') return 5

  const magnitude = Math.abs(value)
  if (magnitude === 0) return 2
  if (magnitude < 0.01) return 8
  if (magnitude < 1) return 4
  if (magnitude < 1000) return 2
  return 2
}

export function formatPrice(
  value: number,
  currency: string | null,
  locale: string,
  assetClass?: string,
): string {
  const decimals = decimalsFor(value, assetClass)
  return formatter(locale, {
    style: currency ? 'currency' : 'decimal',
    currency: currency ?? undefined,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Porcentaje con signo explícito: en una tabla, el `+` comunica tanto como el color. */
export function formatPercent(value: number, locale: string): string {
  const formatted = formatter(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(value)
  return `${formatted} %`
}

export function formatChange(value: number, locale: string): string {
  return formatter(locale, {
    minimumFractionDigits: decimalsFor(value),
    maximumFractionDigits: decimalsFor(value),
    signDisplay: 'always',
  }).format(value)
}

/** Volúmenes abreviados: 54.000.000 ocupa demasiado en una columna estrecha. */
export function formatCompact(value: number, locale: string): string {
  return formatter(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>()

/** Hora en una zona concreta. Se usa para el reloj local y el de Nueva York. */
export function formatTime(at: Date, locale: string, timeZone?: string): string {
  const key = `${locale}:${timeZone ?? 'local'}`
  let cached = timeFormatters.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    })
    timeFormatters.set(key, cached)
  }
  return cached.format(at)
}

export function formatDateTime(at: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(at)
}

/** Tiempo relativo ("hace 3 h"), para listados de noticias. */
export function formatRelative(at: Date, locale: string, now = new Date()): string {
  const diffSeconds = Math.round((at.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const thresholds: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86_400, 'hour'],
    [604_800, 'day'],
  ]

  const absolute = Math.abs(diffSeconds)
  if (absolute < 60) return rtf.format(diffSeconds, 'second')
  for (const [limit, unit] of thresholds) {
    if (absolute < limit * 60 && unit !== 'second') {
      const divisor = limit / 60
      return rtf.format(Math.round(diffSeconds / divisor), unit)
    }
  }
  return rtf.format(Math.round(diffSeconds / 604_800), 'week')
}
