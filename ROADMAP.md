# Roadmap

Cinco fases. Cada una deja la aplicación compilando, probada y ejecutable — no
hay fases intermedias en las que el proyecto quede roto.

Marcadores: ✅ terminado · 🔜 siguiente · ⬜ pendiente

---

## Fase 1 — Arquitectura y fundación ✅

Los contratos, los límites y la infraestructura sobre los que se montan el
resto de fases sin reescribir nada.

- ✅ Scaffold Electron + React + TypeScript + Vite, con fronteras entre capas
  impuestas por lint
- ✅ Contrato IPC tipado con validación zod y exhaustividad garantizada
- ✅ Prisma 7 + SQLite con migrador propio para app empaquetada
- ✅ Cifrado de credenciales con el llavero del sistema
- ✅ Capa de proveedores por capacidades, con failover, caché y control de cuota
- ✅ Tema oscuro, tokens de diseño, i18n español/inglés
- ✅ Espacio de trabajo con dockview y disposiciones persistentes
- ✅ Buscador universal `Ctrl+K` con parser de comandos
- ✅ Registro de atajos con detección de conflictos
- ✅ Configuración: las ocho secciones
- ✅ Documentación y driver de pruebas de interfaz

**No incluido a propósito:** datos de mercado reales. Toda la cadena existe y
está probada, pero servida por un proveedor simulado determinista.

---

## Fase 2 — Datos reales y mercados 🔜

Sustituir el proveedor simulado por proveedores reales **sin tocar el renderer**.

- ⬜ Adaptadores: Finnhub, Polygon, FMP, CoinGecko, Binance
- ⬜ Normalización de símbolos por proveedor (la forma canónica ya existe)
- ⬜ WebSockets para cotizaciones en vivo, sobre el canal de eventos ya definido
- ⬜ Comprobación de credenciales desde Configuración (los campos
  `lastCheckedAt` / `lastCheckOk` ya están en el esquema)
- ⬜ `ChartAdapter` con widgets de TradingView; el adaptador de Advanced Charts
  queda enchufable sin tocar la interfaz
- ⬜ Página de activo: precio, after-hours, capitalización, PER, BPA, sector,
  descripción, directiva
- ⬜ Dashboard real: índices, cripto, mayores subidas y bajadas, volumen
- ⬜ Watchlists completas: varias listas, orden, colores, notas
- ⬜ Favoritos

**Lo que hace falta antes de empezar:** claves de API de al menos un proveedor de
acciones y uno de cripto.

---

## Fase 3 — Noticias, calendario y screeners ⬜

- ⬜ Noticias en tiempo real con filtros por empresa, cripto, mercado, economía,
  tecnología e IA
- ⬜ Guardar noticias favoritas (el modelo `NewsBookmark` ya existe)
- ⬜ Calendario económico: inflación, PIB, FOMC, Fed
- ⬜ Calendario corporativo: resultados, dividendos, splits, OPVs
- ⬜ Screener de acciones: capitalización, volumen, sector, PER, dividendos,
  máximos y mínimos de 52 semanas, beta
- ⬜ Screener de cripto
- ⬜ Indicadores técnicos como criterio: RSI, MACD, EMA, SMA
- ⬜ Datos fundamentales completos: ingresos, beneficios, flujo de caja, balance
- ⬜ Analistas, dividendos, splits, insiders, institucionales

---

## Fase 4 — Portafolio, alertas y Polar AI ⬜

- ✅ Portafolio: compras, ventas, dividendos, historial (los modelos ya existen)
- ✅ Rentabilidad, coste medio y P&L derivados de las transacciones
- ⬜ Gráficas de evolución del portafolio — requiere el histórico de precios de
  cada posición día a día, que en el plan gratuito de FMP son tantas llamadas
  como símbolos por cada recálculo
- ⬜ Alertas de precio, volumen, noticias e indicadores
- ⬜ Notificaciones de escritorio
- ⬜ Centro de alertas disparadas
- ⬜ **Polar AI**: panel de IA multi-proveedor (Anthropic, OpenAI, Gemini),
  configurable por el usuario
- ⬜ Notas ancladas a activos (el modelo `Note` ya existe)

**Regla del panel de IA:** responde únicamente con datos obtenidos por las APIs
configuradas y el contexto de la aplicación. Nunca inventa cifras.

---

## Fase 5 — Optimización y distribución ⬜

- ⬜ Revisión del tamaño del bundle del renderer
- ⬜ Virtualización de tablas largas
- ⬜ Perfilado de repintados con muchos paneles abiertos
- ⬜ Actualizador automático con `electron-updater`
- ⬜ Instaladores para Windows, macOS y Linux
- ⬜ Firma de código
- ⬜ Canal de publicación de versiones

---

## Fuera de alcance por ahora

- **Bonos.** El tipo de activo está reservado en el dominio, sin proveedor asignado.
- **Ejecución de órdenes.** Requiere integración con brókeres, credenciales de
  operación y un nivel de responsabilidad distinto.
- **Sincronización en la nube.** La base es local por diseño.

---

## Cómo se trabaja

Cada fase se divide en bloques. Antes de cada bloque: analizar la arquitectura,
explicar las decisiones. Después: implementar, probar, corregir, documentar.

Dos reglas que no se saltan:

1. **La aplicación compila y arranca al final de cada bloque.**
2. **Lo que se afirma, se verifica ejecutando.** Varios de los bugs más serios de
   la Fase 1 —un mercado congelado, un gráfico de ruido blanco, una disposición
   guardada que se descartaba en silencio, un buscador que ejecutaba lo que no
   era— pasaban el typecheck y las pruebas sin problema. Aparecieron al abrir la
   aplicación y mirarla.
