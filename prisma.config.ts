import { defineConfig } from 'prisma/config'

/**
 * Configuración del CLI de Prisma.
 *
 * Ojo con el alcance: esto **solo** afecta a las herramientas de desarrollo
 * (`prisma migrate dev`, `prisma studio`, `prisma generate`). La aplicación en
 * ejecución no lee este archivo — abre la base de datos de la carpeta de datos
 * del usuario a través del driver adapter. Ver `src/main/db/client.ts`.
 *
 * Por eso la ruta por defecto apunta a una base de desarrollo desechable dentro
 * del repositorio (ignorada por git) y no hace falta crear un `.env` para
 * empezar a trabajar tras clonar.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'file:./prisma/dev.db',
  },
})
