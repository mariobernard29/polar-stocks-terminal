import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MigrationError, runMigrations } from './migrator'

/**
 * El migrador es lo que corre en la máquina del usuario, sin CLI de Prisma
 * disponible. Si falla, la aplicación no arranca o —peor— arranca contra un
 * esquema equivocado. Merece pruebas de verdad, no de humo.
 */

let dir: string
let client: Client

async function writeMigration(name: string, sql: string): Promise<void> {
  await mkdir(join(dir, name), { recursive: true })
  await writeFile(join(dir, name, 'migration.sql'), sql, 'utf8')
}

async function tableExists(name: string): Promise<boolean> {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
    args: [name],
  })
  return result.rows.length > 0
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'polar-migrations-'))

  // Base en ARCHIVO, no `:memory:`.
  //
  // Con `:memory:`, @libsql/client entrega una base distinta por conexión: lo
  // que se crea con `client.execute` no lo ve `client.transaction`, y un commit
  // se pierde sin dar error. Se descubrió aquí, y usar archivo además ejercita
  // exactamente el camino que corre en producción.
  client = createClient({ url: `file:${join(dir, 'test.db').replace(/\\/g, '/')}` })
})

afterEach(async () => {
  client.close()
  // Windows puede mantener el archivo bloqueado un instante tras cerrar; el
  // directorio es temporal, así que no merece la pena reintentar.
  await rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

describe('runMigrations', () => {
  it('aplica las migraciones en orden cronológico, no de descubrimiento', async () => {
    // Se escriben a propósito en orden inverso: la segunda depende de la primera,
    // así que si el migrador no ordenara, esto fallaría.
    await writeMigration(
      '20260102000000_add_column',
      'ALTER TABLE alpha ADD COLUMN extra TEXT;',
    )
    await writeMigration(
      '20260101000000_create',
      'CREATE TABLE alpha ("id" TEXT NOT NULL PRIMARY KEY);',
    )

    const report = await runMigrations(client, dir)

    expect(report.applied).toEqual(['20260101000000_create', '20260102000000_add_column'])
    expect(await tableExists('alpha')).toBe(true)
  })

  it('es idempotente: la segunda ejecución no aplica nada', async () => {
    await writeMigration('20260101000000_init', 'CREATE TABLE beta ("id" TEXT PRIMARY KEY);')

    const first = await runMigrations(client, dir)
    const second = await runMigrations(client, dir)

    expect(first.applied).toHaveLength(1)
    expect(second.applied).toHaveLength(0)
    expect(second.skipped).toBe(1)
  })

  it('registra el checksum en el formato exacto de Prisma (sha256 del archivo)', async () => {
    const sql = 'CREATE TABLE gamma ("id" TEXT PRIMARY KEY);'
    await writeMigration('20260101000000_init', sql)

    await runMigrations(client, dir)

    const rows = await client.execute(
      'SELECT migration_name, checksum, applied_steps_count, finished_at FROM _prisma_migrations',
    )
    const expected = createHash('sha256').update(Buffer.from(sql, 'utf8')).digest('hex')

    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.['checksum']).toBe(expected)
    expect(rows.rows[0]?.['migration_name']).toBe('20260101000000_init')
    expect(rows.rows[0]?.['applied_steps_count']).toBe(1)
    expect(rows.rows[0]?.['finished_at']).not.toBeNull()
  })

  it('detecta que una migración ya aplicada fue editada después', async () => {
    await writeMigration('20260101000000_init', 'CREATE TABLE delta ("id" TEXT PRIMARY KEY);')
    await runMigrations(client, dir)

    // Alguien edita un `.sql` que ya se ejecutó en bases reales.
    await writeMigration(
      '20260101000000_init',
      'CREATE TABLE delta ("id" TEXT PRIMARY KEY, "otra" TEXT);',
    )

    await expect(runMigrations(client, dir)).rejects.toThrow(MigrationError)
    await expect(runMigrations(client, dir)).rejects.toThrow(/su contenido ha cambiado/)
  })

  it('deshace por completo una migración que falla a mitad', async () => {
    await writeMigration('20260101000000_ok', 'CREATE TABLE epsilon ("id" TEXT PRIMARY KEY);')
    await writeMigration(
      '20260102000000_rota',
      'CREATE TABLE zeta ("id" TEXT PRIMARY KEY);\nESTO NO ES SQL VÁLIDO;',
    )

    await expect(runMigrations(client, dir)).rejects.toThrow(MigrationError)

    // La primera migración queda aplicada; la rota no deja rastro parcial.
    expect(await tableExists('epsilon')).toBe(true)
    expect(await tableExists('zeta')).toBe(false)

    const rows = await client.execute('SELECT migration_name FROM _prisma_migrations')
    expect(rows.rows.map((r) => r['migration_name'])).toEqual(['20260101000000_ok'])
  })

  it('puede reanudar tras arreglar una migración rota', async () => {
    await writeMigration('20260101000000_ok', 'CREATE TABLE eta ("id" TEXT PRIMARY KEY);')
    await writeMigration('20260102000000_rota', 'NO ES SQL;')

    await expect(runMigrations(client, dir)).rejects.toThrow(MigrationError)

    await writeMigration('20260102000000_rota', 'CREATE TABLE theta ("id" TEXT PRIMARY KEY);')
    const report = await runMigrations(client, dir)

    expect(report.applied).toEqual(['20260102000000_rota'])
    expect(await tableExists('theta')).toBe(true)
  })

  it('falla con un mensaje accionable si no hay directorio de migraciones', async () => {
    await expect(runMigrations(client, join(dir, 'no-existe'))).rejects.toThrow(
      /extraResources/,
    )
  })

  it('acepta un directorio de migraciones vacío sin romper', async () => {
    const report = await runMigrations(client, dir)
    expect(report.applied).toEqual([])
    expect(report.skipped).toBe(0)
  })
})
