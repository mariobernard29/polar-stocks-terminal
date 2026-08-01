import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Los scripts de npm siempre corren desde la raíz del proyecto. */
const r = (...segments: string[]): string => resolve(process.cwd(), ...segments)

const sharedAlias = { '@shared': r('src/shared') }

export default defineConfig({
  /**
   * Proceso main — Node.js. Dueño de secretos, base de datos, red y WebSockets.
   * Se emite como ESM (.mjs) porque el cliente de Prisma 7 es ESM y package.json
   * declara "type": "module".
   */
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { ...sharedAlias, '@main': r('src/main') } },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: r('src/main/index.ts') },
        output: { format: 'es', entryFileNames: '[name].mjs' },
      },
    },
  },

  /**
   * Preload — el único puente entre main y renderer.
   * Se emite como CommonJS (.cjs) deliberadamente: con `sandbox: true` Electron
   * no admite preloads ESM. La extensión .cjs es obligatoria porque el
   * package.json es "type": "module".
   */
  preload: {
    // Sin `externalizeDepsPlugin` a propósito: un preload en sandbox no puede
    // hacer `require` de módulos npm en tiempo de ejecución. Todo lo que
    // importe debe quedar dentro del bundle o fallará al cargar con
    // "module not found". `electron` sigue siendo externo (lo da el runtime).
    resolve: { alias: sharedAlias },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: r('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },

  /**
   * Renderer — React. Sin acceso a Node, sin API keys.
   */
  renderer: {
    root: r('src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: { alias: { ...sharedAlias, '@renderer': r('src/renderer') } },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: r('src/renderer/index.html') },
      // Ayuda a mantener el arranque rápido separando lo pesado del bundle inicial.
      chunkSizeWarningLimit: 900,
    },
  },
})
