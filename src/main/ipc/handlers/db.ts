import { getDatabaseStatus } from '../../db/client'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

export const status: IpcHandler<'db:status'> = async () => {
  try {
    return await getDatabaseStatus()
  } catch (error) {
    throw new AppError('DATABASE_ERROR', 'No se pudo consultar el estado de la base de datos.', {
      cause: error,
    })
  }
}
