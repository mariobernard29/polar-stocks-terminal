/**
 * Aleatoriedad determinista para el proveedor simulado.
 *
 * `Math.random` no sirve aquí: los datos de prueba deben ser reproducibles
 * entre reinicios y entre ejecuciones de test. Si AAPL cambiara de
 * capitalización cada vez que se abre la app, sería imposible distinguir un
 * cambio real de ruido.
 */

/** Hash FNV-1a de 32 bits. Rápido y con buena dispersión para cadenas cortas. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0xffffffff
}

/**
 * Generador mulberry32: pequeño, rápido y con distribución suficiente para
 * datos de demostración.
 */
export function seededRandom(seed: number): () => number {
  let state = Math.floor(seed * 0xffffffff) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
