import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createClient } from '@libsql/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from './migrator'

const run = promisify(execFile)

/**
 * Prueba de integración del migrador contra las migraciones REALES del
 * proyecto y contra el CLI de Prisma.
 *
 * Es la verificación que sostiene toda la estrategia de despliegue: en la
 * máquina del usuario no hay CLI de Prisma, así que la app aplica sus propias
 * migraciones. Si el resultado no fuera equivalente al del CLI, tendríamos dos
 * esquemas distintos —el de desarrollo y el de producción— divergiendo en
 * silencio.
 *
 * Aquí se migra una base vacía SOLO con nuestro migrador y después se le
 * pregunta al CLI de Prisma si la considera al día.
 */

let dir: string
let dbPath: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'polar-integration-'))
  dbPath = join(dir, 'test.db')
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

describe('migrador contra las migraciones reales del proyecto', () => {
  it('crea un esquema que el CLI de Prisma considera al día', async () => {
    const migrationsDir = join(process.cwd(), 'prisma', 'migrations')
    const client = createClient({ url: `file:${dbPath.replace(/\\/g, '/')}` })

    try {
      const report = await runMigrations(client, migrationsDir)
      expect(report.applied.length).toBeGreaterThan(0)

      // Tablas clave del dominio, para descartar una migración a medias.
      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      const names = tables.rows.map((row) => String(row['name']))

      expect(names).toContain('settings')
      expect(names).toContain('api_credentials')
      expect(names).toContain('watchlists')
      expect(names).toContain('portfolios')
      expect(names).toContain('alerts')
      expect(names).toContain('_prisma_migrations')
    } finally {
      client.close()
    }

    // El veredicto del propio Prisma sobre una base que él no ha migrado.
    const { stdout } = await run(
      'npx',
      ['prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma'],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}` },
        shell: true,
      },
    )

    expect(stdout).toMatch(/up to date|al día/i)
  }, 120_000)
})
