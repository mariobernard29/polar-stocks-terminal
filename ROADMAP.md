# Roadmap

Cinco fases. Cada una deja la aplicación compilando, probada y ejecutable — no
hay fases intermedias en las que el proyecto quede roto.

Marcadores: ✅ terminado · 🟡 parcial · 🔜 siguiente · ⬜ pendiente

Lo marcado 🟡 o ⬜ dentro de una fase entregada lleva escrito **por qué** no está.
Casi siempre es lo mismo: el endpoint existe pero es de pago. Se dice también en
la pantalla correspondiente, en lugar de ofrecer un control que devolvería un
error de suscripción.

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

## Fase 2 — Datos reales y mercados ✅

Sustituir el proveedor simulado por proveedores reales **sin tocar el renderer**.

- ✅ Adaptadores: Finnhub, Polygon, FMP, CoinGecko, NewsAPI
- ⬜ Adaptador de Binance — no llegó a hacer falta: CoinGecko cubre cotización y
  métricas de cripto, y añadir un segundo proveedor del mismo dato antes de
  necesitarlo solo suma superficie que mantener
- ✅ Normalización de símbolos por proveedor (la forma canónica ya existe)
- ✅ WebSockets para cotizaciones en vivo, sobre el canal de eventos ya definido
- ✅ Comprobación de credenciales desde Configuración
- ✅ `ChartAdapter` con widgets de TradingView; el adaptador de Advanced Charts
  queda enchufable sin tocar la interfaz
- ✅ Página de activo: precio, after-hours, capitalización, PER, BPA, sector,
  descripción, directiva
- ✅ Dashboard real: índices, cripto, mayores subidas y bajadas, volumen
- ✅ Watchlists completas: varias listas, orden, colores, notas
- ✅ Favoritos

---

## Fase 3 — Noticias, calendario y screeners 🟡

Entregada, pero con varias partes que el plan gratuito de los proveedores no
permite. Cada una se explica en su propia pantalla en vez de ofrecer un botón
que devolvería un error de suscripción.

- ✅ Noticias en tiempo real con filtros por empresa, cripto, mercado, economía,
  tecnología e IA
- ✅ Guardar noticias favoritas
- ⬜ Calendario económico (inflación, PIB, FOMC, Fed) — Finnhub responde 403 y
  FMP 402 en sus planes gratuitos
- 🟡 Calendario corporativo: **resultados y dividendos sí**; OPVs no (FMP
  responde 402) y splits no los publica ningún proveedor configurado
- 🟡 Screener de acciones: solo preajustes (mayores subidas, bajadas, más
  negociadas). Los filtros libres —capitalización, sector, PER, dividendo,
  beta, máximos de 52 semanas— son el endpoint de pago de FMP
- ✅ Screener de cripto
- ⬜ Indicadores técnicos como criterio: RSI, MACD, EMA, SMA — necesitan la serie
  histórica en cada evaluación, que es lo que Finnhub deniega con 403
- ⬜ Datos fundamentales completos: ingresos, beneficios, flujo de caja, balance
- ⬜ Analistas, dividendos, splits, insiders, institucionales

---

## Fase 4 — Portafolio, alertas y Polar AI 🟡

- ✅ Portafolio: compras, ventas, dividendos, historial (los modelos ya existen)
- ✅ Rentabilidad, coste medio y P&L derivados de las transacciones
- ⬜ Gráficas de evolución del portafolio — requiere el histórico de precios de
  cada posición día a día, que en el plan gratuito de FMP son tantas llamadas
  como símbolos por cada recálculo
- ✅ Alertas de precio y de variación porcentual, evaluadas en segundo plano
- ⬜ Alertas de volumen, noticias e indicadores — el flujo solo trae el volumen
  de cada operación suelta, no el acumulado de la sesión; noticias e indicadores
  exigirían sondear sin parar endpoints que el plan gratuito limita o deniega
- ✅ Notificaciones de escritorio
- ✅ Centro de alertas disparadas
- ✅ **Polar AI**: panel de IA multi-proveedor (Anthropic, OpenAI, Gemini),
  conmutable por el usuario, con respuesta en streaming
- ✅ Anclaje a datos reales, con las fuentes visibles bajo cada respuesta
- ⬜ Notas ancladas a activos (el modelo `Note` ya existe)

**Regla del panel de IA:** responde únicamente con datos obtenidos por las APIs
configuradas y el contexto de la aplicación. Nunca inventa cifras.

---

## Fase 5 — Optimización y distribución ⬜

- ✅ Revisión del tamaño del bundle del renderer — el trozo de arranque baja de
  1.395 a 1.260 kB sacando zod del renderer. El efecto en el tiempo de arranque
  fue de ~20 ms sobre ~1.100: dentro del ruido. Se conserva por ser la frontera
  correcta, no por velocidad
- ⬜ Virtualización de tablas largas — **no procede todavía**: las listas más
  largas son de 40-51 filas y se pintan en una fracción de fotograma. Merecerá la
  pena a partir de unas 500 filas
- ✅ Medición del arranque, con marcas permanentes en la línea de tiempo
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
