import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const r = (...segments: string[]): string => resolve(process.cwd(), ...segments)

export default defineConfig({
  resolve: {
    alias: {
      '@shared': r('src/shared'),
      '@main': r('src/main'),
      '@renderer': r('src/renderer'),
    },
  },
  test: {
    // Por defecto Node: la mayoría de la lógica que merece prueba (contratos,
    // parsers, rate limiter, migrador) es pura y no necesita DOM. Los tests de
    // componentes declararán `// @vitest-environment jsdom` en su cabecera.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
  },
})
