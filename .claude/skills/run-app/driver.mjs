/**
 * Driver REPL para Polar Stocks Terminal (Electron).
 *
 * Un agente no puede ver una ventana. Este driver la convierte en algo
 * inspeccionable: se le mandan comandos por stdin y responde con texto y
 * capturas de pantalla.
 *
 * Funciona en dos modos:
 *   - Interactivo:  node .claude/skills/run-app/driver.mjs
 *   - Por lotes:    printf 'launch\nss inicio\nquit\n' | node .claude/skills/run-app/driver.mjs
 *
 * Windows no necesita xvfb: Electron tiene display real.
 */
import { _electron as electron } from 'playwright-core'
import * as readline from 'node:readline'
import * as fs from 'node:fs'
import * as path from 'node:path'

const APP_DIR = path.resolve(import.meta.dirname, '../../..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(APP_DIR, '.screenshots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const ELECTRON_BIN =
  process.platform === 'win32'
    ? path.join(APP_DIR, 'node_modules/electron/dist/electron.exe')
    : process.platform === 'darwin'
      ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
      : path.join(APP_DIR, 'node_modules/electron/dist/electron')

let app = null
let page = null
const consoleErrors = []

const COMMANDS = {
  async launch() {
    if (app) return console.log('ya lanzada')
    if (!fs.existsSync(ELECTRON_BIN)) {
      return console.log(
        `ERROR: no existe el binario de Electron en ${ELECTRON_BIN}\n` +
          '  Solución: cd node_modules/electron && node install.js',
      )
    }
    app = await electron.launch({
      executablePath: ELECTRON_BIN,
      args: [APP_DIR],
      cwd: APP_DIR,
      timeout: 60_000,
    })
    page = await app.firstWindow({ timeout: 30_000 })

    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

    // Espera a que React haya pintado algo, en vez de dormir a ciegas.
    await page.waitForSelector('#root > *', { timeout: 20_000 })
    console.log('lanzada. ventanas:', app.windows().length)
    for (const w of app.windows()) console.log('  ', w.url())
  },

  async ss(name) {
    if (!page) return console.log('ERROR: primero "launch"')
    const file = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png')
    await page.screenshot({ path: file })
    console.log('captura:', file)
  },

  /** Click por DOM, no por coordenadas: inmune a capas superpuestas. */
  async click(sel) {
    if (!page) return console.log('ERROR: primero "launch"')
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return 'NO_ENCONTRADO'
      el.click()
      return 'OK'
    }, sel)
    console.log('click', sel, '→', r)
  },

  /**
   * Rellena un campo: `fill <selector> | <valor>`.
   *
   * Hace falta un comando propio porque el `click` de arriba usa `el.click()`
   * del DOM, que en Chromium **no da el foco** a un input: lo que se escribiera
   * después con `type` acabaría en el body y el formulario quedaría vacío,
   * fallando de una forma que parece un error de la aplicación.
   *
   * `page.fill` además dispara los eventos que React necesita para enterarse
   * del cambio en un input controlado.
   *
   * El separador es `|` y no el espacio porque los selectores llevan espacios
   * (`form input[...]`) y los valores también pueden llevarlos.
   */
  async fill(...args) {
    if (!page) return console.log('ERROR: primero "launch"')
    const [sel, value = ''] = args.join(' ').split('|').map((part) => part.trim())
    try {
      await page.fill(sel, value)
      console.log('fill', sel, '→', JSON.stringify(value))
    } catch (e) {
      console.log('ERROR:', e.message.split('\n')[0])
    }
  },

  async type(text) {
    if (page) await page.keyboard.type(text, { delay: 30 })
  },

  async press(key) {
    if (page) await page.keyboard.press(key)
  },

  async wait(sel) {
    if (!page) return console.log('ERROR: primero "launch"')
    try {
      await page.waitForSelector(sel, { timeout: 10_000 })
      console.log('encontrado:', sel)
    } catch {
      console.log('TIMEOUT:', sel)
    }
  },

  async sleep(ms) {
    if (page) await page.waitForTimeout(Number(ms) || 1000)
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: primero "launch"')
    try {
      console.log(JSON.stringify(await page.evaluate(expr), null, 2))
    } catch (e) {
      console.log('ERROR:', e.message)
    }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: primero "launch"')
    console.log(
      await page.evaluate(
        (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
        sel || null,
      ),
    )
  },

  /** Errores de consola del renderer acumulados desde el arranque. */
  async errors() {
    console.log(consoleErrors.length ? consoleErrors.join('\n') : '(sin errores de consola)')
  },

  async quit() {
    if (app) await app.close().catch(() => {})
    app = null
    page = null
  },

  help() {
    console.log('comandos:', Object.keys(COMMANDS).join(', '))
  },
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
})

// En modo por lotes readline entrega todas las líneas de golpe. Sin esta cola
// los comandos se solaparían y `ss` correría antes de que `launch` terminara.
let queue = Promise.resolve()

rl.on('line', (line) => {
  queue = queue.then(async () => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const [cmd, ...rest] = trimmed.split(/\s+/)
    const fn = COMMANDS[cmd]
    if (!fn) return console.log('desconocido:', cmd, '— prueba: help')
    try {
      await fn(rest.join(' '))
    } catch (e) {
      console.log('ERROR:', e.message)
    }
    if (cmd === 'quit') {
      rl.close()
      process.exit(0)
    }
  })
})

// En modo por lotes stdin se cierra en cuanto se han leído todas las líneas,
// mucho antes de que la cola las haya ejecutado. Hay que drenarla primero.
rl.on('close', () => {
  queue = queue.then(async () => {
    await COMMANDS.quit()
    process.exit(0)
  })
})

console.log('driver de Polar Stocks Terminal — "help" para comandos, "launch" para arrancar')
