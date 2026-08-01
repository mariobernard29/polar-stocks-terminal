/**
 * Genera los iconos de la aplicación a partir del SVG de origen.
 *
 * Se ejecuta con `npm run icons`. No hace falta lanzarlo en cada build: los
 * resultados se versionan. Existe para que rehacer los iconos tras un cambio de
 * marca sea un comando y no una sesión de editor gráfico.
 *
 * electron-builder genera el `.ico` de Windows y el `.icns` de macOS a partir de
 * `resources/icon.png` siempre que mida al menos 256×256, así que aquí basta con
 * producir un PNG grande y limpio.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const SOURCE_ICON = 'src/renderer/assets/polar-icon.svg'
const OUTPUT_DIR = 'resources'

/**
 * 1024 para el maestro (macOS lo pide) y 512 como tamaño del que
 * electron-builder deriva el resto.
 */
const SIZES = [
  { name: 'icon.png', size: 512 },
  { name: 'icon@2x.png', size: 1024 },
]

await mkdir(OUTPUT_DIR, { recursive: true })

for (const { name, size } of SIZES) {
  await sharp(SOURCE_ICON, { density: 384 })
    .resize(size, size, {
      fit: 'contain',
      // Fondo transparente: el instalador y la barra de tareas ponen el suyo.
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(join(OUTPUT_DIR, name))

  console.log(`generado ${join(OUTPUT_DIR, name)} (${size}×${size})`)
}
