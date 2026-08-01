import { useEffect } from 'react'
import { shortcutFromEvent } from '@shared/shortcuts/keys'
import { COMMANDS } from '../app/commands'
import { useUiStore } from '../stores/ui-store'
import { useCommandActions } from './use-command-actions'

/**
 * Atajos con modificador poco habitual que **sí** deben funcionar mientras se
 * escribe. `Ctrl+K` abre el buscador estando dentro de un campo de texto, que es
 * justo cuando más falta hace; en cambio `Escape` dentro de un campo debe
 * cancelar la edición, no cerrar un panel.
 */
const ALLOWED_WHILE_TYPING = new Set(['Ctrl+K'])

/**
 * Si el evento viene de un campo de texto.
 *
 * Un atajo como `Ctrl+1` no debe dispararse mientras alguien escribe el nombre
 * de una watchlist. Vive aquí y no en `shared` porque necesita tipos del DOM.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Registro global de atajos.
 *
 * Un único listener en `window` para todos, en lugar de uno por comando: menos
 * trabajo en cada pulsación y un orden de resolución determinista.
 *
 * Se escucha en fase de captura para poder adelantarse a componentes que
 * gestionan teclas por su cuenta.
 */
export function useShortcuts(): void {
  const runCommand = useCommandActions()
  const paletteOpen = useUiStore((state) => state.commandPaletteOpen)

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const combination = shortcutFromEvent(event)
      const typing = isTypingTarget(event.target)

      // El buscador gestiona sus propias teclas mientras está abierto; solo se
      // atiende Escape para cerrarlo.
      if (paletteOpen) {
        if (combination === 'Escape') {
          event.preventDefault()
          runCommand('palette.close')
        }
        return
      }

      if (typing && !ALLOWED_WHILE_TYPING.has(combination)) return

      const command = COMMANDS.find(
        (candidate) =>
          candidate.shortcut !== null &&
          candidate.scope !== 'palette' &&
          candidate.shortcut === combination,
      )
      if (!command) return

      event.preventDefault()
      runCommand(command.id)
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [runCommand, paletteOpen])
}
