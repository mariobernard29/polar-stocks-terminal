import { describe, expect, it } from 'vitest'
import { findShortcutConflicts, normalizeShortcut, shortcutFromEvent } from './keys'

describe('normalizeShortcut', () => {
  it('ordena los modificadores siempre igual', () => {
    expect(normalizeShortcut('shift+ctrl+k')).toBe('Ctrl+Shift+K')
    expect(normalizeShortcut('Ctrl+Shift+K')).toBe('Ctrl+Shift+K')
    expect(normalizeShortcut('Shift+Ctrl+k')).toBe('Ctrl+Shift+K')
  })

  it('acepta los sinónimos habituales', () => {
    expect(normalizeShortcut('control+k')).toBe('Ctrl+K')
    expect(normalizeShortcut('cmd+k')).toBe('Meta+K')
    expect(normalizeShortcut('esc')).toBe('Escape')
    expect(normalizeShortcut('option+n')).toBe('Alt+N')
  })

  it('mantiene las teclas de función en mayúscula', () => {
    expect(normalizeShortcut('f11')).toBe('F11')
    expect(normalizeShortcut('F11')).toBe('F11')
  })

  it('tolera espacios sobrantes', () => {
    expect(normalizeShortcut(' ctrl + shift + g ')).toBe('Ctrl+Shift+G')
  })

  it('normaliza los atajos que pide la especificación', () => {
    expect(normalizeShortcut('Ctrl+K')).toBe('Ctrl+K')
    expect(normalizeShortcut('Ctrl+W')).toBe('Ctrl+W')
    expect(normalizeShortcut('Ctrl+Shift+N')).toBe('Ctrl+Shift+N')
    expect(normalizeShortcut('Ctrl+Shift+G')).toBe('Ctrl+Shift+G')
    expect(normalizeShortcut('Ctrl+1')).toBe('Ctrl+1')
  })
})

describe('shortcutFromEvent', () => {
  const event = (
    key: string,
    modifiers: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {},
  ): Parameters<typeof shortcutFromEvent>[0] => ({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  })

  it('convierte un evento en su combinación canónica', () => {
    expect(shortcutFromEvent(event('k', { ctrlKey: true }))).toBe('Ctrl+K')
    expect(shortcutFromEvent(event('G', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+G')
    expect(shortcutFromEvent(event('F11'))).toBe('F11')
    expect(shortcutFromEvent(event('Escape'))).toBe('Escape')
  })

  it('produce la misma cadena que normalizeShortcut para la misma combinación', () => {
    expect(shortcutFromEvent(event('1', { ctrlKey: true }))).toBe(normalizeShortcut('Ctrl+1'))
    expect(shortcutFromEvent(event('n', { ctrlKey: true, shiftKey: true }))).toBe(
      normalizeShortcut('Ctrl+Shift+N'),
    )
  })
})

describe('findShortcutConflicts', () => {
  it('no ve conflictos donde no los hay', () => {
    const conflicts = findShortcutConflicts([
      { id: 'search', shortcut: 'Ctrl+K', scope: 'global' },
      { id: 'chart', shortcut: 'Ctrl+Shift+G', scope: 'global' },
    ])
    expect(conflicts).toEqual([])
  })

  it('detecta dos acciones con la misma combinación', () => {
    const conflicts = findShortcutConflicts([
      { id: 'search', shortcut: 'Ctrl+K', scope: 'global' },
      { id: 'otra', shortcut: 'ctrl+k', scope: 'global' },
    ])

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.shortcut).toBe('Ctrl+K')
    expect(conflicts[0]?.commandIds).toEqual(['search', 'otra'])
  })

  it('detecta el conflicto aunque los modificadores estén en otro orden', () => {
    const conflicts = findShortcutConflicts([
      { id: 'a', shortcut: 'Ctrl+Shift+G', scope: 'global' },
      { id: 'b', shortcut: 'Shift+Ctrl+g', scope: 'global' },
    ])
    expect(conflicts).toHaveLength(1)
  })

  /**
   * `Escape` cierra el buscador cuando está abierto y cierra un panel cuando no
   * lo está. Son contextos excluyentes, no un conflicto. Sin esta distinción la
   * comprobación daría falsos positivos y la gente aprendería a ignorarla.
   */
  it('no marca conflicto entre ámbitos distintos', () => {
    const conflicts = findShortcutConflicts([
      { id: 'cerrarBuscador', shortcut: 'Escape', scope: 'palette' },
      { id: 'cerrarPanel', shortcut: 'Escape', scope: 'workspace' },
    ])
    expect(conflicts).toEqual([])
  })

  it('agrupa tres o más acciones en un único conflicto', () => {
    const conflicts = findShortcutConflicts([
      { id: 'a', shortcut: 'Ctrl+1', scope: 'global' },
      { id: 'b', shortcut: 'Ctrl+1', scope: 'global' },
      { id: 'c', shortcut: 'Ctrl+1', scope: 'global' },
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.commandIds).toHaveLength(3)
  })
})
