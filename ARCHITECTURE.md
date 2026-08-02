# Arquitectura

Este documento explica cómo está construida Polar Stocks Terminal y, sobre todo,
**por qué**. Las decisiones sin motivo se acaban revirtiendo por accidente.

---

## Principio rector

El proyecto está pensado para crecer durante años. El riesgo real en algo así no
es escribir funcionalidad, sino que las decisiones de la primera semana hagan
imposibles las del sexto mes. Por eso hay tres reglas que el compilador o el
lint hacen cumplir, en vez de dejarlas a la disciplina de quien programa:

1. **El renderer nunca alcanza el proceso main.** Lo impide `eslint-plugin-boundaries`.
2. **Un canal IPC sin handler no compila.** Lo impide un tipo mapeado.
3. **Las capacidades de un proveedor se deducen de sus métodos.** No hay dónde mentir.

---

## Las cuatro capas

```
src/
  shared/     Tipos, contratos y lógica pura. Sin dependencias de proceso.
  main/       Node.js. Dueño de secretos, base de datos, red y WebSockets.
  preload/    Puente. Única superficie entre main y renderer.
  renderer/   React. Sin acceso a Node, sin API keys.
```

| Capa | Archivos | Puede importar de |
|---|---|---|
| `shared` | 19 | `shared` |
| `main` | 32 | `main`, `shared` |
| `preload` | 1 | `preload`, `shared` |
| `renderer` | 47 | `renderer`, `shared` |

La regla está en `eslint.config.mjs` y **está verificada**: hay sondas que
comprueban que `main → renderer`, `renderer → main`, `shared → main` y
`preload → renderer` fallan el lint, y que los cuatro cruces legítimos pasan.

> **Trampa que costó tiempo:** `eslint-plugin-boundaries` v7 cambió de API
> (`boundaries/dependencies` con `policies`, no `boundaries/element-types` con
> `rules`), sus patrones son `src/main` y **no** `src/main/**/*`, y sin
> `eslint-import-resolver-typescript` no resuelve `.tsx` y **falla en silencio**:
> el lint pasa sin comprobar nada. Si alguien toca esa configuración, que
> verifique con una sonda que sigue bloqueando.

### `src/shared`

Lo único que ven las tres capas. No importa nada de Electron, Node ni el DOM —
`tsconfig.node.json` lo compila sin `lib.dom` a propósito, así que un módulo
compartido que asuma navegador no compila.

```
shared/
  domain/       Instrument, Quote, Candle, NewsItem, Capability, consultas
  ipc/          channels.ts (sin deps), contract.ts (zod), api.ts, errors.ts
  market/       session.ts — estado de sesión del NYSE con festivos
  commands/     parser.ts — el parser del buscador universal
  shortcuts/    keys.ts — normalización y detección de conflictos
  settings.ts   Catálogo de preferencias con esquema y valor por defecto
```

**Convenciones del dominio:**

- **Todas las marcas de tiempo son epoch en milisegundos UTC**, nunca cadenas.
  Una cadena obliga a decidir la zona horaria en cada frontera y es la causa
  clásica de errores de un día en aplicaciones financieras.
- **Los símbolos tienen forma canónica propia.** Cada proveedor escribe Bitcoin
  distinto (`BTC-USD`, `BTCUSDT`, `BTC/USD`); cada adaptador traduce en su
  frontera. Sin esto, la watchlist de un usuario se rompe al cambiar de
  proveedor.
- Los importes del portafolio se guardan en `Decimal`; las cotizaciones para
  mostrar son `number`.

### `src/main`

```
main/
  index.ts        Arranque, ventana, CSP, ciclo de vida
  ipc/            register.ts (validación + exhaustividad), handlers/, app-error.ts
  db/             client.ts, migrator.ts, paths.ts, repositories/
  providers/      registry.ts, types.ts, mock/
  security/       credentials.ts — cifrado con safeStorage
  cache/          ttl-cache.ts (LRU), rate-limiter.ts (token bucket)
  lib/            logger.ts
```

### `src/preload`

Un archivo, dos funciones: `invoke` y `subscribe`. Nada más.

Es superficie de seguridad, así que se mantiene diminuta: no expone
`ipcRenderer`, ni `require`, ni ningún módulo de Node. Tiene una **lista blanca
de canales** construida desde el contrato — sin ella, código inyectado en el
renderer podría invocar cualquier canal del main.

> **Trampa:** el preload importa `shared/ipc/channels` y **no** `shared/ipc/contract`.
> El contrato arrastra zod, y un preload en sandbox no puede hacer `require` de
> módulos npm en runtime: la app arrancaba con `module not found: zod`. Por eso
> `channels.ts` existe separado y sin dependencias, y por eso el preload se
> empaqueta **sin** `externalizeDepsPlugin`.

También por sandbox, el preload se emite como **CommonJS (`.cjs`)** mientras que
el main se emite como **ESM (`.mjs`)**: con `sandbox: true` Electron no admite
preloads ESM, y `package.json` es `"type": "module"`.

### `src/renderer`

```
renderer/
  app/           router.tsx, navigation.ts, commands.ts
  components/    layout/ (TopBar, Sidebar, TitleBar, AppShell), PlaceholderPage
  features/      workspace/, settings/, command/
  panels/        registry.ts + ChartPanel, WatchlistPanel, NewsPanel
  hooks/         use-settings, use-capabilities, use-shortcuts, use-market-clock…
  stores/        ui-store, workspace-store
  lib/           ipc.ts, format.ts, query-client.ts, cn.ts
  i18n/          config + locales/{es,en}.ts
  styles/        globals.css — tokens de diseño
```

---

## El contrato IPC

Todo lo que cruza entre procesos está declarado en `src/shared/ipc/contract.ts`:
**28 canales** hoy. De ese único objeto se derivan, sin repetir nada:

1. Los tipos de entrada y salida de cada canal.
2. La validación con zod en el main.
3. La firma de `window.polar.invoke`.
4. La comprobación de que **todos** los canales tienen handler.

```
renderer                preload              main
  ipc.market.quote()  →  invoke()  →  valida input (zod)
                                      ejecuta handler
                                      valida output (solo en dev)
  PolarError       ←  { ok:false }  ←  AppError
  Quote            ←  { ok:true  }  ←  Quote
```

**Los handlers devuelven un sobre `{ ok, data | error }` en vez de lanzar.**
Electron destroza los `Error` al serializarlos y se perdería el código y el flag
de reintento. El cliente del renderer deshace el sobre y relanza un `PolarError`
tipado, de modo que la UI escribe `try/catch` normal y TanStack Query distingue
lo reintentable de lo que no.

La validación de entrada está en **un solo punto**, el registrador — no depende
de que cada handler se acuerde. Ejemplo real: `app:openExternal` solo admite
`https` **en el contrato**, así que una URL `file://` incrustada en una noticia
de terceros se rechaza antes de llegar a ningún código.

---

## Persistencia

**Prisma 7 + SQLite**, con `@prisma/adapter-libsql`.

Prisma 7 no lleva motor Rust: el cliente generado es TypeScript puro (sin
binarios), así que no hay nada que desempaquetar del asar. El único binario
nativo es el de libsql, que llega **precompilado como N-API** — ABI estable,
funciona en Electron sin recompilar y sin exigir Python ni MSVC a nadie.

- **En desarrollo**: `prisma/dev.db`, la misma que ve `prisma studio`.
- **En producción**: la carpeta de datos del usuario. Nunca dentro del bundle —
  se reemplaza entero en cada actualización.

### El migrador de tiempo de ejecución

`prisma migrate deploy` no existe en una app empaquetada. `src/main/db/migrator.ts`
aplica los mismos `.sql` que genera el CLI, y **escribe en `_prisma_migrations`
con el formato y el checksum exactos de Prisma** (sha256 del archivo). Una base
migrada por la app es indistinguible de una migrada por el CLI, y
`prisma migrate status` sigue sirviendo para diagnosticar la base de un usuario.
Hay un test de integración que lo comprueba: migra una base vacía solo con
nuestro migrador y le pregunta al CLI de Prisma, que la da por al día.

Cada migración va en **su propia transacción**, no una global: si la tercera
falla, las dos primeras quedan aplicadas y el arranque siguiente reanuda.

> **Trampa:** `:memory:` en `@libsql/client` entrega **una base distinta por
> conexión**. Lo que crea `client.execute` no lo ve `client.transaction`, y un
> commit se pierde sin error. Las pruebas usan archivo temporal.

**15 modelos.** Los de Portafolio y Alertas existen desde la Fase 1 aunque su
interfaz llegue en la Fase 4: cambiar un esquema con datos reales encima es lo
más caro del proyecto.

Las posiciones **no se almacenan**: se derivan de las transacciones. Guardar
ambas cosas invita a que se desincronicen.

---

## Seguridad

| Medida | Dónde |
|---|---|
| `contextIsolation`, `sandbox`, sin `nodeIntegration` | `main/index.ts` |
| CSP estricta (sin excepciones en producción) | `main/index.ts` |
| Navegación externa bloqueada; enlaces al navegador del sistema | `main/index.ts` |
| Sin menú por defecto (se apropiaba de `Ctrl+W`) | `main/index.ts` |
| Lista blanca de canales | `preload/index.ts` |
| Solo se aceptan llamadas de ventanas propias | `main/ipc/register.ts` |
| Validación zod de toda entrada | `main/ipc/register.ts` |
| Claves cifradas con `safeStorage` | `main/security/credentials.ts` |

**Las API keys nunca llegan al renderer.** Ni siquiera para mostrarlas: la
máscara (`••••••••1234`) se calcula en el main. Está verificado buscando el
texto en claro dentro del archivo SQLite — no aparece.

Si el sistema no ofrece cifrado (Linux sin keyring), la app **se niega a
guardar** en vez de escribir en claro con un aviso. Un aviso que nadie lee
convierte un fallo visible en una fuga silenciosa.

---

## Capa de proveedores

La aplicación no se programa contra «Finnhub» o «Polygon», sino contra
**capacidades**: `quote`, `historical`, `news`, `search`, `cryptoQuote`…

```ts
export interface MarketDataProvider extends ProviderDescriptor {
  readonly methods: Readonly<Partial<CapabilityMethods>>
}
```

Las capacidades **se derivan** de los métodos presentes. Un proveedor no puede
anunciar que da noticias y no implementar `news`.

El `ProviderRegistry` resuelve por capacidad y se encarga de:

- **Orden de preferencia** configurable por el usuario.
- **Failover**: si el preferente falla, se intenta el siguiente.
- **Caché** con TTL por capacidad (cotización 5 s, histórico 1 h).
- **Cuota** con token bucket por proveedor.

Reporta tres estados por capacidad:

- `available` — hay proveedor sano.
- `degraded` — hay proveedor pero limitado (cuota agotada, último intento falló).
- `unavailable` — ninguno la ofrece, con el motivo.

`degraded` existe porque decir `available` y servir datos con retraso sin avisar
es inaceptable en una herramienta con la que alguien decide dónde pone su dinero.

Esto es lo que convierte «si una API no está configurada, la app sigue
funcionando y muestra qué está deshabilitado» en una propiedad de la
arquitectura, y no en un `if` repartido por la interfaz. La UI pregunta
`useCapability('news')` y no sabe nada de proveedores.

---

## Portafolio

Dos decisiones que condicionan todo lo demás:

**Las posiciones no se almacenan.** No hay tabla `Position`: se derivan de las
transacciones en cada consulta (`derivePositions`, en
`src/shared/portfolio/positions.ts`). Guardar las dos cosas obligaría a
mantenerlas sincronizadas en cada alta, baja y corrección, y basta un fallo para
que el coste medio guardado deje de corresponderse con el historial *sin
ninguna señal de que ha pasado*. Derivar cuesta más por consulta y no se nota:
una cartera personal tiene cientos de operaciones, no millones.

**El valor de mercado lo calcula el renderer.** El canal `portfolio:positions`
devuelve cantidad, coste medio y resultado realizado, pero **ningún precio**. El
renderer los combina con las cotizaciones que ya tiene en la caché de TanStack
Query —las mismas que alimenta el WebSocket—, así que la cartera se revaloriza
con cada tick sin una sola petición adicional. Si el main devolviera el valor ya
sumado, habría que volver a pedirlo entero cada vez que se moviera un precio.

El método es **coste medio ponderado**, que es el que muestran casi todos los
brókers minoristas. No es el único válido: FIFO y lote específico dan cifras
distintas y pueden importar a efectos fiscales. Queda escrito aquí y en el
módulo porque es el tipo de detalle que, si no se documenta, alguien acaba
descubriendo al comparar con su bróker.

Las comisiones de compra aumentan el coste base; las de venta reducen los
ingresos. El módulo tiene 23 pruebas con las cifras esperadas calculadas a mano
—no derivadas del propio código— porque es la parte del proyecto donde un error
se traduce en que alguien vea mal cuánto ha ganado.

Cuando falta la cotización de una posición, la pantalla lo dice. No se cuenta
como cero: eso abultaría la pérdida en silencio.

---

## Alertas

El motor vive en el proceso principal (`src/main/alerts/engine.ts`), y tiene que
ser así: una alerta que solo se evaluara con su pantalla abierta no sería una
alerta.

**Se dispara al cruzar, no al estar.** Es la decisión que hace la función usable.
Una alerta de «AAPL por encima de 200» no salta en cada tick mientras el precio
siga en 210: salta en el instante en que pasa de no cumplirse a cumplirse. Sin
esto, una sola alerta generaría un aviso cada 250 ms.

De ahí se derivan dos consecuencias que la interfaz tiene que contar:

- La primera observación **arma** pero no dispara. Si al crear la alerta su
  condición ya se cumple, `alerts:create` lo devuelve y la pantalla lo advierte
  en el único momento en que el usuario puede corregir el umbral.
- El estado de armado se guarda **en memoria**. Al reiniciar, todas las alertas
  se rearman con la primera observación, así que no disparan por lo que ocurrió
  mientras la aplicación estaba cerrada. Notificar al arrancar un cruce de hace
  tres días sería ruido con apariencia de aviso.

Dos fuentes de datos, por necesidad. El **sondeo** cada 60 s es la vía principal
y la única que sirve para todo: índices, divisas y materias primas no tienen
flujo en vivo, y la variación de la sesión no viaja en los ticks —una operación
suelta no sabe con qué abrió el valor—. Los **ticks** del WebSocket solo cubren
alertas de precio, pero bajan el aviso de un minuto a menos de un segundo.

El canal `alerts:capabilities` existe para que la pantalla no prometa vigilancia
que no hay: sin proveedor de cotizaciones configurado, las alertas se guardan
pero no se evalúan, y eso se dice en rojo.

---

## Polar AI

El requisito era que no invente nada. Un prompt no lo garantiza —ninguno lo
hace—, así que se sostiene sobre tres capas:

1. **No dar margen.** Los datos se recopilan *antes* de preguntar
   (`src/main/ai/context-builder.ts`) y se entregan en un bloque cerrado. El
   modelo no recibe herramientas para buscar más: lo que hay es lo que hay.
2. **Instruir sin ambigüedad.** `src/shared/ai/prompt.ts` prohíbe usar
   conocimiento propio para cualquier cifra y obliga a citar fuente y antigüedad.
3. **Hacerlo verificable.** Bajo cada respuesta se listan los datos que se
   usaron.

La tercera es la que de verdad protege al usuario. Las dos primeras reducen la
probabilidad de una cifra falsa; la última la hace detectable a simple vista, y
es la única que no depende de que el modelo obedezca.

Qué se recopila lo decide la propia pregunta: se extraen los símbolos que
menciona (con una lista de exclusión para que «¿el PER de AAPL?» no vaya a
buscar cotización de `PER`), y solo se piden noticias o cartera si el texto habla
de ellas. Cargar de oficio veinte símbolos «por si acaso» agotaría la cuota del
plan gratuito en unas pocas preguntas y llenaría el contexto de ruido.

Lo que **falla también viaja al modelo**: si no se pudo obtener una cotización,
se le dice, para que pueda mencionarlo en vez de callarse o improvisar.

Los tres proveedores hablan SSE con formas distintas dentro. El transporte se
comparte en `src/main/ai/sse.ts`; cada adaptador solo interpreta su JSON. Ese
lector admite `\n`, `\r\n` y `\r` como fin de línea porque **Gemini usa `\r\n`**:
buscando solo `\n\n` la respuesta llegaba vacía, sin error y sin rastro visible
en un volcado.

Las claves siguen el mismo camino que las de mercado: cifradas con `safeStorage`
y sin cruzar nunca el IPC. El renderer envía un texto y recibe otro.

---

## Estado en el renderer

Frontera estricta y deliberada:

| Qué | Dónde | Por qué |
|---|---|---|
| Datos del main (cotizaciones, noticias, ajustes) | **TanStack Query** | Ya sabe cachear, reintentar e invalidar |
| Estado de interfaz (sidebar, buscador abierto) | **Zustand** | Es efímero y local |

**Zustand nunca guarda datos de mercado.** Mezclarlos es la causa más común de
estado obsoleto en aplicaciones de este tipo.

La política de reintentos usa el flag `retryable` de nuestros errores:
reintentar una validación fallida o una credencial ausente es ruido que además
consume cuota.

`workspace-store` publica las acciones del espacio de trabajo (añadir panel,
cerrar, duplicar) para que los atajos globales y el buscador — que viven en el
shell — puedan invocarlas sin propagar callbacks por el router.

---

## Espacio de trabajo

**dockview** para los paneles. Elegido sobre `react-mosaic` (mantenimiento
estancado) y `react-grid-layout` (grid, no tiling con pestañas) porque serializa
y deserializa el layout completo a JSON, que es exactamente lo que se persiste.

La serialización se trata como **caja negra**: se guarda y se devuelve tal cual.
Lo único que interpretamos son los parámetros de cada panel, y solo para
validarlos al restaurar — un layout guardado hace meses puede traer parámetros de
una versión anterior. Si no encajan, ese panel cae a sus valores por defecto en
vez de tumbar la disposición entera.

La disposición inicial se construye **por código**, no desde un JSON grabado: un
JSON atado a una versión de dockview envejece mal.

> **Trampa:** `onReady` de dockview se dispara una sola vez al montar. Si el
> componente se monta antes de que resuelva la consulta de layouts guardados,
> siembra la disposición inicial y **descarta en silencio lo que el usuario tenía
> guardado**. Por eso no se monta hasta que la consulta termina.

El tema reasigna las variables `--dv-*` a los tokens del proyecto, así que hereda
cualquier cambio de tema.

---

## Sistema de diseño

Tokens CSS en `src/renderer/styles/globals.css`. **Ningún componente usa colores
literales.**

Los tokens direccionales (`--polar-up`, `--polar-down`) están separados de los
semánticos (`--polar-positive`, `--polar-negative`). Invertir la convención de
color —la asiática, donde el rojo es subida— o activar el modo daltónico es
reasignar cuatro variables. Está verificado midiendo el color computado en los
tres modos.

Otras decisiones:

- **Cifras tabulares en todo número.** Sin ellas, las columnas de precios bailan
  en cada tick.
- **Densidad como token**, no como clases sueltas.
- El formateo es sensible al idioma **y a la escala**: SHIB vale 0,000021 y con
  dos decimales fijos se mostraría como 0,00, que es un dato falso.

---

## Reloj de mercado

`src/shared/market/session.ts` calcula pre-apertura, sesión regular,
after-hours y cierre, con festivos reales del NYSE: los móviles (MLK, Memorial,
Acción de Gracias), el **Viernes Santo** (que no es festivo federal pero el
mercado cierra), la regla de traslado sábado→viernes y domingo→lunes, y las
medias sesiones de las 13:00.

Todo se calcula sobre la hora de Nueva York obtenida con `Intl`, **nunca con
desplazamientos fijos**: el horario de verano cambia dos veces al año. Hay
pruebas específicas de EDT (UTC−4) y EST (UTC−5).

---

## Buscador universal

`src/shared/commands/parser.ts` — módulo puro, 30 pruebas.

Entiende `AAPL`, `AAPL chart`, `BTC noticias`, `NVDA fundamentales`, en español
e inglés, con y sin tildes, y con abreviaturas de una letra (`AAPL g`).

**Decisión importante:** `banco` tiene exactamente la misma forma que `AAPL` —
cinco letras. Ninguna expresión regular las distingue. El parser **no adivina**:
mantiene el candidato y devuelve también el texto como búsqueda libre, y quien
descarta el candidato es el buscador comprobando si ese símbolo existe de
verdad. Un dato, no una heurística.

---

## Atajos

Catálogo único en `src/renderer/app/commands.ts`: de ahí salen a la vez el
listado del buscador y el registro de atajos, así que el atajo que se muestra es
siempre el que funciona.

La detección de conflictos (`shared/shortcuts/keys.ts`) distingue **ámbitos**:
`Escape` cierra el buscador cuando está abierto y cierra un panel cuando no lo
está — contextos excluyentes, no una colisión. Sin esa distinción la
comprobación daría falsos positivos y se aprendería a ignorarla.

---

## Pruebas

**135 pruebas.** El criterio es cubrir lo que es lógica pura y lo que, si se
rompe, se rompe en silencio:

| Módulo | Qué defiende |
|---|---|
| `ipc/contract` | Que `app:openExternal` rechaza `file:`, `javascript:`, `data:` |
| `db/migrator` | Orden, idempotencia, checksum, rollback, reanudación |
| `db/migrator.integration` | Que Prisma acepta una base migrada por nosotros |
| `cache` | Expiración, desalojo LRU, ráfagas y reposición de cuota |
| `providers/registry` | Failover, prioridad, credencial ausente, estados |
| `providers/mock` | Continuidad de la serie, escalas, descorrelación |
| `market/session` | Horario de verano, festivos móviles, Viernes Santo |
| `commands/parser` | Símbolos, verbos bilingües, ambigüedad |
| `shortcuts/keys` | Normalización y conflictos por ámbito |
| `settings/ApisSection` | Que el campo de clave es password, se limpia y no filtra |

Las de `providers/mock` merecen mención: nacieron de bugs reales encontrados
**mirando capturas de pantalla**, no ejecutando tests. Un generador de precios
puede pasar todos los tests de tipo y producir un mercado congelado o ruido
blanco.
