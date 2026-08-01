# Base de datos

Polar Stocks Terminal guarda todo en local: configuración, disposiciones,
watchlists, favoritos, portafolio, alertas, historial y notas. No hay servidor ni
sincronización en la nube.

**Motor:** SQLite, a través de `@libsql/client` y Prisma 7.

---

## Índice

1. [Puesta en marcha](#1-puesta-en-marcha)
2. [Dónde vive la base de datos](#2-dónde-vive-la-base-de-datos)
3. [Migraciones](#3-migraciones)
4. [Cómo funcionan las migraciones en producción](#4-cómo-funcionan-las-migraciones-en-producción)
5. [Copias de seguridad](#5-copias-de-seguridad)
6. [Cambiar SQLite por PostgreSQL](#6-cambiar-sqlite-por-postgresql)
7. [Problemas frecuentes](#7-problemas-frecuentes)

---

## 1. Puesta en marcha

Prisma ya está en las dependencias del proyecto; `npm install` lo instala. Tras
clonar:

```bash
npm install
npm run db:migrate     # crea prisma/dev.db y aplica las migraciones
npm run db:generate    # genera el cliente tipado en src/main/db/generated/
```

**No hace falta Python ni compilador de C++.** Prisma 7 no lleva motor Rust —el
cliente generado es TypeScript puro— y libsql se distribuye como binario N-API
precompilado.

Para inspeccionar los datos:

```bash
npm run db:studio      # abre Prisma Studio sobre la base de desarrollo
```

El cliente generado está en `.gitignore`: se regenera con `db:generate`. Si tras
clonar el editor no reconoce los tipos de Prisma, es que falta ese paso.

---

## 2. Dónde vive la base de datos

| Entorno | Ruta |
|---|---|
| Desarrollo | `prisma/dev.db` (dentro del repositorio, ignorada por git) |
| Producción — Windows | `%APPDATA%\Polar Stocks Terminal\polar-stocks.db` |
| Producción — macOS | `~/Library/Application Support/Polar Stocks Terminal/polar-stocks.db` |
| Producción — Linux | `~/.config/Polar Stocks Terminal/polar-stocks.db` |

La ruta exacta se muestra en **Configuración → Base de datos**, seleccionable
para copiarla.

En desarrollo se usa a propósito la misma base que el CLI, para que
`prisma studio` enseñe exactamente lo que la aplicación está viendo.

**La base nunca vive dentro del bundle de la aplicación.** El bundle se
reemplaza entero en cada actualización; una base ahí dentro significaría borrar
el portafolio del usuario en cada versión nueva.

> `DATABASE_URL` solo la usa el CLI de Prisma en desarrollo. La aplicación en
> ejecución no la lee: calcula la ruta desde la carpeta de datos del usuario.

---

## 3. Migraciones

### Cambiar el esquema

1. Edita `prisma/schema.prisma`.
2. Crea la migración:

```bash
npm run db:migrate -- --name descripcion_del_cambio
```

Esto genera `prisma/migrations/<marca-de-tiempo>_descripcion/migration.sql`, lo
aplica a la base de desarrollo y regenera el cliente.

3. **Versiona el `.sql` generado.** Es lo que se distribuye con la aplicación.

### Regla que no se salta

**Nunca edites una migración ya publicada.** El migrador guarda el sha256 de
cada archivo aplicado; si cambia, se niega a arrancar con un mensaje explícito.
Es intencionado: seguir adelante dejaría bases con el mismo nombre de migración
y esquemas distintos — silencioso e irreparable.

¿Te has equivocado en una migración ya publicada? Crea otra que lo corrija.

### Empezar de cero en desarrollo

```bash
rm prisma/dev.db*
npm run db:migrate
```

---

## 4. Cómo funcionan las migraciones en producción

`prisma migrate deploy` necesita el CLI de Prisma, que no viaja dentro de la
aplicación. Así que la app aplica sus propias migraciones al arrancar:

1. Los `.sql` se empaquetan como `extraResources` (ver `electron-builder.yml`),
   fuera del archivo asar.
2. Al arrancar, antes de crear la ventana, `src/main/db/migrator.ts` lee el
   directorio, ordena por nombre —la marca de tiempo hace que el orden
   lexicográfico sea el cronológico— y aplica las que falten.
3. Cada migración va en **su propia transacción**. Si una falla, esa se deshace
   entera y las anteriores quedan aplicadas: el siguiente arranque reanuda desde
   ahí.
4. Se registra en la tabla `_prisma_migrations` **con el mismo formato y el mismo
   checksum que usa Prisma**.

Ese último punto tiene una consecuencia práctica útil: una base migrada por la
aplicación es indistinguible de una migrada por el CLI, así que
`prisma migrate status` funciona sobre la base de un usuario para diagnosticar.

```bash
DATABASE_URL="file:C:/ruta/a/polar-stocks.db" npx prisma migrate status
```

Si la base no se puede abrir o migrar, la aplicación **no arranca**: muestra un
diálogo con el motivo y se cierra. Arrancar contra un esquema desfasado produce
errores mucho peores y más difíciles de diagnosticar.

---

## 5. Copias de seguridad

### A mano

Con la aplicación **cerrada**, copia el archivo `.db` de la ruta que aparece en
Configuración → Base de datos.

En Windows:

```powershell
Copy-Item "$env:APPDATA\Polar Stocks Terminal\polar-stocks.db" "$env:USERPROFILE\Desktop\polar-backup.db"
```

En macOS o Linux:

```bash
cp ~/.config/"Polar Stocks Terminal"/polar-stocks.db ~/polar-backup.db
```

> **Cierra la aplicación antes.** SQLite puede tener cambios pendientes en los
> archivos `-wal` y `-shm`; copiar solo el `.db` con la app abierta puede dar una
> copia incompleta. Si necesitas copiar en caliente, copia los tres archivos.

### En caliente y de forma consistente

```bash
sqlite3 polar-stocks.db ".backup 'polar-backup.db'"
```

`.backup` es seguro con la base en uso.

### Restaurar

Cierra la aplicación, sustituye el archivo por la copia y vuelve a abrir. El
migrador pondrá al día el esquema si la copia es de una versión anterior.

---

## 6. Cambiar SQLite por PostgreSQL

Tiene sentido si el proyecto crece hacia varios equipos, sincronización entre
dispositivos o una versión servidor.

### Paso 1 — Adaptador y esquema

```bash
npm install @prisma/adapter-pg pg
npm uninstall @prisma/adapter-libsql @libsql/client
```

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
}
```

### Paso 2 — Configuración del CLI

```ts
// prisma.config.ts
datasource: {
  url: process.env['DATABASE_URL'] ?? 'postgresql://usuario:clave@localhost:5432/polar',
}
```

### Paso 3 — Cliente de la aplicación

En `src/main/db/client.ts`, sustituye el adaptador:

```ts
import { PrismaPg } from '@prisma/adapter-pg'

client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
```

### Paso 4 — Migraciones

Las migraciones existentes son SQL de SQLite y **no sirven** en PostgreSQL. Hay
que regenerarlas:

```bash
rm -rf prisma/migrations
npm run db:migrate -- --name init_postgres
```

El migrador de tiempo de ejecución sigue funcionando igual: lee `.sql` y los
aplica en orden. Solo cambia el dialecto.

### Paso 5 — Repasar estas diferencias

| Detalle | SQLite | PostgreSQL |
|---|---|---|
| `Bytes` (credenciales cifradas) | `BLOB` | `bytea` — se mapea solo |
| `Decimal` | Almacenado como texto/numérico | `numeric` nativo, más preciso |
| Búsquedas sin distinguir mayúsculas | `LIKE` ya es insensible | Requiere `ILIKE` o `citext` |
| Concurrencia | Un escritor a la vez | Múltiples escritores |

**Ojo con las credenciales cifradas:** están cifradas con el llavero de *una*
máquina y *un* usuario. Al mover la base a otro equipo dejan de poder
descifrarse. Es intencionado. El usuario tendrá que volver a introducir sus API
keys.

### Paso 6 — Migrar los datos existentes

Para un usuario que ya tenía SQLite, la vía más simple es un script que abra
ambas bases con Prisma y copie tabla por tabla, saltándose `ApiCredential`.
Empieza por las tablas sin relaciones (`Setting`, `Layout`, `Watchlist`) y sigue
por las dependientes.

---

## 7. Problemas frecuentes

**`La base de datos no está inicializada`**
Se ha consultado antes de `initDatabase()`. Es un error de orden de arranque:
la base se abre y migra antes de crear la ventana.

**`La migración X ya estaba aplicada pero su contenido ha cambiado`**
Alguien editó un `.sql` ya aplicado. En desarrollo: borra `prisma/dev.db*` y
vuelve a migrar. En producción: crea una migración nueva que corrija, y
restaura el archivo original.

**`No se encontró el directorio de migraciones`**
En una aplicación empaquetada significa que `extraResources` no incluyó
`prisma/migrations`. Revisa `electron-builder.yml`.

**El editor no reconoce los tipos de Prisma**
Falta `npm run db:generate`. El cliente generado no se versiona.

**`SQLITE_BUSY` o la base parece bloqueada**
Hay dos instancias abiertas. La aplicación tiene bloqueo de instancia única
precisamente para evitarlo; si ocurre en desarrollo, cierra `prisma studio`.

**Las claves de API dejaron de funcionar tras mover la base**
Es lo esperado: están cifradas con el llavero de la máquina de origen. Vuelve a
introducirlas en Configuración → APIs.
