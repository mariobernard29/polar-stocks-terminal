import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createClient } from '@libsql/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import type { DatabaseStatus } from '@shared/ipc/contract'
import { PrismaClient } from './generated/client'
import { logger } from '../lib/logger'
import { runMigrations } from './migrator'
import { resolveDatabasePath, resolveMigrationsDir, toLibsqlUrl } from './paths'

/**
 * Ciclo de vida de la base de datos.
 *
 * Vive solo en el proceso main. El renderer nunca ve Prisma ni SQL: pide datos
 * por IPC y recibe objetos de dominio ya validados. Es la misma frontera que
 * protege las API keys.
 *
 * Prisma 7 no lleva motor Rust: el cliente generado es TypeScript puro y la
 * conexión la aporta el driver adapter. En la práctica eso significa que aquí
 * no hay binarios que desempaquetar del asar más allá del `.node` de libsql.
 */

let client: PrismaClient | null = null
let status: { path: string; appliedNow: string[]; alreadyApplied: number } | null = null

export async function initDatabase(isDev: boolean): Promise<PrismaClient> {
  if (client) return client

  const databasePath = resolveDatabasePath(isDev)
  const migrationsDir = resolveMigrationsDir(isDev)

  // En un primer arranque la carpeta de datos del usuario puede no existir.
  await mkdir(dirname(databasePath), { recursive: true })

  const url = toLibsqlUrl(databasePath)
  logger.info(`[db] abriendo base de datos en ${databasePath}`)

  // Se usa un cliente crudo para migrar, antes de que Prisma toque nada: si el
  // esquema estuviera desfasado, Prisma fallaría de forma mucho menos clara.
  const migrationClient = createClient({ url })
  try {
    const report = await runMigrations(migrationClient, migrationsDir)
    status = {
      path: databasePath,
      appliedNow: [...report.applied],
      alreadyApplied: report.skipped,
    }
    if (report.applied.length > 0) {
      logger.info(`[db] migraciones aplicadas: ${report.applied.join(', ')}`)
    } else {
      logger.info(`[db] esquema al día (${report.skipped} migraciones ya aplicadas)`)
    }
  } finally {
    migrationClient.close()
  }

  client = new PrismaClient({ adapter: new PrismaLibSql({ url }) })
  return client
}

/**
 * Acceso al cliente ya inicializado.
 *
 * Lanza si se llama antes de `initDatabase`. Es deliberado: una consulta antes
 * de migrar es un error de orden de arranque, y prefiero que reviente en
 * desarrollo a que abra una base sin esquema.
 */
export function getPrisma(): PrismaClient {
  if (!client) {
    throw new Error('La base de datos no está inicializada. Llama a initDatabase() primero.')
  }
  return client
}

/**
 * Estado de la base de datos para diagnóstico.
 *
 * Incluye la ruta del archivo a propósito: es lo primero que necesita alguien
 * que quiera hacer una copia de seguridad o mirar la base con un visor SQLite.
 */
export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  if (!status) {
    throw new Error('La base de datos no está inicializada.')
  }

  let sizeBytes = 0
  try {
    sizeBytes = (await stat(status.path)).size
  } catch {
    // Si el archivo no se puede leer, el tamaño es un dato accesorio.
  }

  return { ...status, sizeBytes }
}

export async function closeDatabase(): Promise<void> {
  if (!client) return
  await client.$disconnect()
  client = null
  logger.info('[db] conexión cerrada')
}
