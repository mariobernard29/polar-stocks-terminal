import { join } from 'node:path'
import { app } from 'electron'

/**
 * Dónde vive la base de datos.
 *
 * En producción, en la carpeta de datos del usuario. **Nunca dentro del
 * bundle**: el bundle se reemplaza entero en cada actualización, así que una
 * base ahí dentro significaría borrar el portafolio del usuario en cada
 * versión nueva.
 *
 * En desarrollo se usa la misma base que el CLI de Prisma (`prisma/dev.db`),
 * para que `prisma studio` muestre exactamente lo que la app está viendo.
 */
export function resolveDatabasePath(isDev: boolean): string {
  return isDev
    ? join(process.cwd(), 'prisma', 'dev.db')
    : join(app.getPath('userData'), 'polar-stocks.db')
}

/**
 * Dónde están los `.sql` de migración.
 *
 * En producción viajan como `extraResources` (ver electron-builder.yml), fuera
 * del asar: el migrador los lee como archivos normales en el arranque. Esto es
 * lo que permite migrar sin enviar el CLI de Prisma dentro del instalador.
 */
export function resolveMigrationsDir(isDev: boolean): string {
  return isDev
    ? join(process.cwd(), 'prisma', 'migrations')
    : join(process.resourcesPath, 'migrations')
}

/** URL que espera el driver adapter de libsql. */
export function toLibsqlUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, '/')}`
}
