---
name: run-app
description: Compilar, ejecutar y manejar Polar Stocks Terminal (Electron). Úsala cuando te pidan arrancar la app de escritorio, tomar una captura, comprobar visualmente un cambio o interactuar con su interfaz.
---

Polar Stocks Terminal es una app Electron. Una ventana no es inspeccionable por
un agente, así que para uso automatizado se maneja con el driver REPL de
Playwright en `.claude/skills/run-app/driver.mjs`.

En Windows **no hace falta xvfb**: Electron tiene display real.

## Requisitos

```bash
npm install
# El binario de Electron a veces no se descarga en el install inicial:
[ -f node_modules/electron/dist/electron.exe ] || (cd node_modules/electron && node install.js)
```

## Compilar antes de ejecutar

El driver lanza **la app compilada** (`out/`), no el servidor de desarrollo.
Esto ejerce la ruta de producción (`file://`), que es la que se rompe de verdad.

```bash
npm run build
```

## Ejecutar (ruta del agente)

Modo por lotes — lo habitual para verificar:

```bash
printf 'launch\nsleep 2000\nss inicio\ntext\nerrors\nquit\n' \
  | node .claude/skills/run-app/driver.mjs
```

Modo interactivo:

```bash
node .claude/skills/run-app/driver.mjs
```

Las capturas se guardan en `.screenshots/` (se puede cambiar con `SCREENSHOT_DIR`).
**Abre la captura y míralas.** Un fotograma en negro es un fallo de arranque.

### Comandos

| comando | qué hace |
|---|---|
| `launch` | arranca la app y espera a que React pinte |
| `ss [nombre]` | captura → `.screenshots/<nombre>.png` |
| `click <css>` | click vía DOM (no por coordenadas) |
| `type <texto>` / `press <tecla>` | entrada de teclado |
| `wait <css>` | espera un selector, timeout de 10 s |
| `sleep <ms>` | pausa |
| `eval <js>` | evalúa en la página e imprime JSON |
| `text [css]` | imprime innerText |
| `errors` | errores de consola del renderer acumulados |
| `quit` | cierra y sale |

## Ejecutar (ruta humana)

```bash
npm run dev   # abre la ventana con HMR. Ctrl-C para salir.
```

## Gotchas

- **El binario de Electron no siempre se descarga** con `npm install`. Si el
  driver dice que no existe, ejecuta `node install.js` dentro de
  `node_modules/electron`.
- **Los comandos se serializan en una cola.** En modo por lotes readline
  entrega todas las líneas de golpe; sin la cola, `ss` correría antes de que
  `launch` terminara y todo respondería `ERROR: primero "launch"`.
- **stdin se cierra antes de que la cola se vacíe** en modo por lotes. El
  handler de `close` drena la cola antes de salir; no lo simplifiques.
- **El preload es `.cjs`, no `.mjs`.** Con `sandbox: true` Electron no admite
  preloads ESM, y `package.json` es `"type": "module"`. Si el puente
  `window.polar` aparece como `undefined`, revisa que
  `out/preload/index.cjs` exista y que la ruta en `webPreferences.preload`
  apunte ahí.

## Comprobación rápida de salud

Verifica de una vez arranque, tokens de diseño y puente IPC:

```bash
printf 'launch\nsleep 2000\neval ({bg:getComputedStyle(document.body).backgroundColor, bridge: typeof window.polar?.ping})\neval window.polar.ping().then(v=>"PING: "+v)\nerrors\nquit\n' \
  | node .claude/skills/run-app/driver.mjs
```

Esperado: `bg` = `rgb(8, 9, 10)`, `bridge` = `function`, `PING: pong`, sin errores.
