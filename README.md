# Polar Stocks Terminal

Terminal financiera de escritorio para acciones, ETFs, índices, criptomonedas,
forex y materias primas. Construida con Electron, React y TypeScript.

> **Estado: Fase 1 completada.** La aplicación arranca, tiene espacio de trabajo
> con paneles arrastrables y persistentes, buscador universal, atajos, base de
> datos local cifrada y las ocho secciones de configuración.
>
> **Los datos de mercado son simulados.** La capa de proveedores está completa y
> probada, pero solo tiene conectado un proveedor de datos deterministas. Los
> proveedores reales (Finnhub, Polygon, FMP, CoinGecko…) entran en la Fase 2 sin
> tocar la interfaz. Ver [ROADMAP.md](ROADMAP.md).

---

## Requisitos

| Herramienta | Versión | Nota |
|---|---|---|
| Node.js | ≥ 22 (probado en 24.14) | |
| npm | ≥ 10 | El proyecto usa npm; hay `package-lock.json` |
| Git | cualquiera | |

**No hace falta Python ni compilador de C++.** La única dependencia nativa
(libsql) se distribuye como binario N-API precompilado.

Sistemas soportados: Windows, macOS y Linux. El desarrollo se ha hecho en
Windows 11.

---

## Instalación

```bash
git clone <url-del-repositorio> polar-stocks-terminal
cd polar-stocks-terminal
npm install
```

Si `npm install` no descarga el binario de Electron (ocurre a veces):

```bash
cd node_modules/electron && node install.js && cd ../..
```

Prepara la base de datos de desarrollo:

```bash
npm run db:migrate     # crea prisma/dev.db y aplica las migraciones
npm run db:generate    # genera el cliente tipado de Prisma
```

---

## Ejecutar

```bash
npm run dev
```

Abre la ventana con recarga en caliente del renderer. El proceso main se
reinicia solo al cambiar sus archivos.

Para ejecutar la versión compilada, tal y como la verá un usuario:

```bash
npm run build
npm start
```

---

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo con recarga en caliente |
| `npm run build` | Comprueba tipos y compila a `out/` |
| `npm start` | Ejecuta lo compilado |
| `npm run typecheck` | `tsc --noEmit` sobre los dos proyectos |
| `npm run lint` | ESLint, incluidas las reglas de fronteras entre capas |
| `npm run lint:fix` | Igual, corrigiendo lo corregible |
| `npm run format` | Prettier |
| `npm test` | Vitest |
| `npm run test:watch` | Vitest en modo observación |
| `npm run db:migrate` | Crea y aplica una migración en desarrollo |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:studio` | Abre Prisma Studio sobre la base de desarrollo |
| `npm run dist` | Genera instaladores (Fase 5) |

---

## Configurar proveedores de datos

**Las API keys no se ponen en el código ni en un archivo `.env`.** Se
introducen desde la aplicación:

1. Abre la app y ve a **Configuración → APIs** (o pulsa `Ctrl+5`).
2. Pega la clave en el proveedor correspondiente y pulsa Guardar.

La clave viaja al proceso principal, se cifra con el llavero del sistema
operativo y se guarda como blob cifrado en la base de datos local. La interfaz
nunca vuelve a verla: solo recibe una máscara con los cuatro últimos caracteres.

La misma pantalla muestra **qué funciones están disponibles, degradadas o no
disponibles** y por qué. La aplicación funciona sin ningún proveedor
configurado; simplemente ofrece menos.

`.env.example` documenta todas las variables que el proyecto reconoce y dónde
conseguir cada clave.

---

## Añadir un módulo nuevo

La arquitectura está pensada para que cada tipo de extensión tenga un único
punto de entrada. [ARCHITECTURE.md](ARCHITECTURE.md) lo explica en detalle; el
resumen:

**Un endpoint IPC nuevo**
1. Añade el nombre a `src/shared/ipc/channels.ts`.
2. Añade su entrada (`input`/`output` con zod) a `src/shared/ipc/contract.ts`.
3. Implementa el handler en `src/main/ipc/handlers/` y regístralo en su `index.ts`.

Si olvidas el paso 3, **falla el typecheck**. No hay forma de dejarlo a medias.

**Un proveedor de datos nuevo**
1. Crea `src/main/providers/<nombre>/index.ts` que exporte un `MarketDataProvider`.
2. Añádelo a `ALL_PROVIDERS` en `src/main/providers/index.ts`.

Sus capacidades se deducen de los métodos que implementes. No hay que declararlas.

**Un panel nuevo**
1. Crea el componente en `src/renderer/panels/`.
2. Añade su entrada a `PANEL_REGISTRY` en `src/renderer/panels/registry.ts`.

El menú «Añadir panel», la carga diferida y la validación de parámetros al
restaurar un layout salen de ahí.

**Una preferencia nueva**
Añade una línea a `settingsCatalog` en `src/shared/settings.ts`. No requiere
migración de base de datos.

**Un idioma nuevo**
Copia `src/renderer/i18n/locales/es.ts`, tradúcelo y regístralo en
`src/renderer/i18n/index.ts`. Si falta una clave, no compila.

---

## Actualizar dependencias

```bash
npm outdated
npm update              # dentro del rango semver
```

Para saltos de versión mayor, comprueba antes estas restricciones reales del
proyecto:

- **`electron-vite` marca el techo de Vite.** Hoy admite hasta Vite 7.
- **`typescript-eslint` marca el techo de TypeScript.** Hoy `< 6.1`. Subir a TS 7
  deja sin funcionar el lint con tipos, que es donde vive la regla de fronteras.
- **`@vitejs/plugin-react` debe coincidir con la mayor de Vite.**
- **El adaptador de Prisma fija la mayor de `@libsql/client`.**

Tras cualquier subida: `npm run typecheck && npm run lint && npm test && npm run build`.

---

## Publicar

Empaquetado e instaladores llegan en la **Fase 5**. La configuración de
`electron-builder` ya está en `electron-builder.yml`, incluidos el desempaquetado
del binario nativo del asar y el envío de las migraciones SQL como recurso
externo.

```bash
npm run dist        # instalador para el sistema actual
npm run dist:win    # instalador NSIS para Windows
```

Falta por hacer antes de distribuir: firma de código, canal de publicación y
`electron-updater`.

---

## Documentación

| Documento | Contenido |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arquitectura completa: capas, módulos, estado, decisiones y sus porqués |
| [ROADMAP.md](ROADMAP.md) | Las cinco fases, qué entra en cada una |
| [DATABASE_SETUP.md](DATABASE_SETUP.md) | Prisma, migraciones, respaldos y migración a PostgreSQL |

---

## Aviso

Polar Stocks Terminal muestra información de mercado con fines informativos. No
constituye asesoramiento financiero.
