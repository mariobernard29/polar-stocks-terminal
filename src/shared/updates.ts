import { z } from 'zod'

/**
 * Estado del actualizador.
 *
 * `manual` merece explicación: significa que **hay** una versión nueva pero esta
 * instalación no puede aplicarla sola. Es el caso de macOS sin firma, donde
 * Squirrel valida la firma antes de sustituir la aplicación y la instalación
 * fallaría después de haber descargado. La interfaz ofrece entonces la página de
 * descargas en lugar de un botón que va a fallar al final.
 *
 * `unsupported` es el modo desarrollo: no hay nada que actualizar.
 */
export const updateStatusSchema = z.enum([
  'idle',
  'checking',
  /** Hay versión nueva y se puede descargar desde aquí. */
  'available',
  /** Hay versión nueva pero hay que descargarla a mano. */
  'manual',
  'downloading',
  /** Descargada y lista para instalar al reiniciar. */
  'ready',
  /** Ya está en la última versión. */
  'current',
  'error',
  'unsupported',
])
export type UpdateStatus = z.infer<typeof updateStatusSchema>

export const updateStateSchema = z.object({
  status: updateStatusSchema,
  /** Versión disponible, o la instalada si ya está al día. */
  version: z.string().nullable(),
  /** Progreso de descarga, 0–100. */
  percent: z.number().int().nullable(),
  /** Detalle del fallo, si lo hubo. */
  message: z.string().nullable(),
})
export type UpdateState = z.infer<typeof updateStateSchema>
