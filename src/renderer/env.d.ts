/// <reference types="vite/client" />

import type { PolarApi } from '@shared/ipc/api'

declare global {
  interface Window {
    /**
     * Única puerta del renderer hacia el proceso main. No existe ninguna otra
     * vía: sin acceso a Node, sin `require`, sin API keys en este proceso.
     */
    readonly polar: PolarApi
  }
}

export {}
