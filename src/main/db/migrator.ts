import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Client } from '@libsql/client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrador de tiempo de ejecución
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `prisma migrate deploy` no existe en una aplicación empaquetada: necesita el
 * CLI de Prisma, que son decenas de megas y un proceso Node aparte. Así que la
 * app aplica sus propias migraciones al arrancar, leyendo los mismos `.sql` que
 * genera `prisma migrate dev`.
 *
 * Decisión clave: se escribe en la tabla `_prisma_migrations` **con el mismo
 * formato y el mismo checksum (sha256 del archivo) que usa Prisma**. Así una
 * base migrada por esta función es indistinguible de una migrada por el CLI, y
 * `prisma migrate status` sigue siendo útil para diagnosticar la base de un
 * usuario. La alternativa —una tabla propia— habría creado dos mundos
 * incompatibles.
 */

/** DDL idéntico al que crea Prisma, para que las bases no diverjan. */
const MIGRATIONS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`

export interface MigrationReport {
  /** Migraciones aplicadas en esta ejecución, en orden. */
  readonly applied: readonly string[]
  /** Migraciones que ya estaban aplicadas. */
  readonly skipped: number
}

export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

interface PendingMigration {
  readonly name: string
  readonly sql: string
  readonly checksum: string
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Lee las migraciones del disco en orden.
 *
 * El nombre de carpeta que genera Prisma empieza por marca de tiempo
 * (`20260801044238_init`), así que el orden lexicográfico *es* el orden
 * cronológico. No hace falta parsear nada.
 */
async function readMigrationsFromDisk(migrationsDir: string): Promise<PendingMigration[]> {
  let entries
  try {
    entries = await readdir(migrationsDir, { withFileTypes: true })
  } catch (error) {
    throw new MigrationError(
      `No se encontró el directorio de migraciones en ${migrationsDir}. ` +
        'En una app empaquetada esto significa que `extraResources` no las incluyó.',
      { cause: error },
    )
  }

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const migrations: PendingMigration[] = []
  for (const name of directories) {
    const file = join(migrationsDir, name, 'migration.sql')
    try {
      const raw = await readFile(file)
      migrations.push({ name, sql: raw.toString('utf8'), checksum: sha256(raw) })
    } catch (error) {
      throw new MigrationError(`No se pudo leer la migración ${name}.`, { cause: error })
    }
  }

  return migrations
}

/** Migraciones ya aplicadas, con su checksum, indexadas por nombre. */
async function readAppliedMigrations(client: Client): Promise<Map<string, string>> {
  await client.execute(MIGRATIONS_TABLE_DDL)

  const result = await client.execute(
    'SELECT migration_name, checksum FROM _prisma_migrations ' +
      'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  )

  const applied = new Map<string, string>()
  for (const row of result.rows) {
    applied.set(String(row['migration_name']), String(row['checksum']))
  }
  return applied
}

/**
 * Pone la base de datos al día.
 *
 * Cada migración se aplica dentro de su propia transacción: si una falla a
 * mitad, esa migración se deshace entera y las anteriores quedan aplicadas.
 * Es preferible a una transacción única para todo, porque deja la base en un
 * estado conocido y reanudable en vez de todo o nada.
 */
export async function runMigrations(
  client: Client,
  migrationsDir: string,
): Promise<MigrationReport> {
  const onDisk = await readMigrationsFromDisk(migrationsDir)
  const applied = await readAppliedMigrations(client)

  // Un checksum distinto en una migración ya aplicada significa que alguien
  // editó un `.sql` que ya se había ejecutado en bases reales. Seguir adelante
  // dejaría bases con el mismo nombre de migración y esquemas distintos, que es
  // el peor escenario posible: silencioso e irreparable.
  for (const migration of onDisk) {
    const appliedChecksum = applied.get(migration.name)
    if (appliedChecksum !== undefined && appliedChecksum !== migration.checksum) {
      throw new MigrationError(
        `La migración ${migration.name} ya estaba aplicada pero su contenido ha cambiado. ` +
          'Nunca se debe editar una migración ya publicada: crea una nueva.',
      )
    }
  }

  const pending = onDisk.filter((migration) => !applied.has(migration.name))
  const appliedNow: string[] = []

  for (const migration of pending) {
    const transaction = await client.transaction('write')
    try {
      await transaction.executeMultiple(migration.sql)
      await transaction.execute({
        sql:
          'INSERT INTO _prisma_migrations ' +
          '(id, checksum, migration_name, started_at, finished_at, applied_steps_count) ' +
          'VALUES (?, ?, ?, current_timestamp, current_timestamp, 1)',
        args: [randomUUID(), migration.checksum, migration.name],
      })
      await transaction.commit()
      appliedNow.push(migration.name)
    } catch (error) {
      await transaction.rollback().catch(() => undefined)
      throw new MigrationError(
        `Falló la migración ${migration.name}. La base de datos quedó en el estado anterior.`,
        { cause: error },
      )
    }
  }

  return { applied: appliedNow, skipped: onDisk.length - appliedNow.length }
}
