/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Combinaciones de teclas
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Módulo puro: normaliza combinaciones y detecta conflictos. Se separa de la
 * interfaz porque la detección de conflictos tiene que estar probada — es lo que
 * impide que dos acciones queden atadas a la misma tecla cuando el usuario
 * personalice sus atajos desde Configuración.
 *
 * Tipado estructural en lugar de `KeyboardEvent` para que se pueda probar sin
 * DOM: aquí solo interesan los cinco campos que definen una combinación.
 */

export interface KeyEventLike {
  readonly key: string
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
}

/** Orden canónico de modificadores, para que `Shift+Ctrl+K` y `Ctrl+Shift+K` sean iguales. */
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const

const KEY_ALIASES: Readonly<Record<string, string>> = {
  control: 'Ctrl',
  ctrl: 'Ctrl',
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  esc: 'Escape',
  escape: 'Escape',
  space: 'Space',
  ' ': 'Space',
}

function canonicalKey(raw: string): string {
  const lower = raw.toLowerCase()
  const alias = KEY_ALIASES[lower]
  if (alias) return alias

  // Las teclas de función se escriben en mayúscula (F11); el resto de teclas de
  // un solo carácter también, para que `ctrl+k` y `Ctrl+K` coincidan.
  if (/^f\d{1,2}$/.test(lower)) return lower.toUpperCase()
  if (raw.length === 1) return raw.toUpperCase()
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * Lleva una combinación escrita a mano a su forma canónica.
 * `'shift+ctrl+k'` → `'Ctrl+Shift+K'`
 */
export function normalizeShortcut(shortcut: string): string {
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(canonicalKey)

  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.includes(modifier))
  const keys = parts.filter((part) => !MODIFIER_ORDER.includes(part as never))

  return [...modifiers, ...keys].join('+')
}

/** Combinación que representa un evento de teclado real. */
export function shortcutFromEvent(event: KeyEventLike): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(canonicalKey(event.key))
  return parts.join('+')
}

export interface ShortcutConflict {
  readonly shortcut: string
  /** Identificadores de las acciones que compiten por la misma combinación. */
  readonly commandIds: readonly string[]
}

/**
 * Detecta combinaciones asignadas a más de una acción **en el mismo ámbito**.
 *
 * El ámbito importa: `Escape` puede cerrar el buscador y, cuando el buscador no
 * está abierto, cerrar un panel. Eso no es un conflicto, son contextos
 * excluyentes. Sin distinguir ámbitos, la comprobación daría falsos positivos y
 * la gente aprendería a ignorarla.
 */
export function findShortcutConflicts(
  bindings: readonly { id: string; shortcut: string; scope: string }[],
): ShortcutConflict[] {
  const byKey = new Map<string, string[]>()

  for (const binding of bindings) {
    const key = `${binding.scope}::${normalizeShortcut(binding.shortcut)}`
    const existing = byKey.get(key)
    if (existing) {
      existing.push(binding.id)
    } else {
      byKey.set(key, [binding.id])
    }
  }

  const conflicts: ShortcutConflict[] = []
  for (const [key, commandIds] of byKey) {
    if (commandIds.length > 1) {
      conflicts.push({ shortcut: key.split('::')[1] ?? key, commandIds })
    }
  }
  return conflicts
}

// `isTypingTarget` vive en el renderer (`hooks/use-shortcuts.ts`): necesita
// tipos del DOM, y `shared` se compila sin `lib.dom` a propósito para que no
// pueda asumir que hay navegador. También lo usa el proceso main.
