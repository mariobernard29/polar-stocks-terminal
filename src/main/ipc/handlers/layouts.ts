import type { LayoutRecord, LayoutSummary } from '@shared/ipc/contract'
import * as repository from '../../db/repositories/layouts'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

/**
 * Los repositorios devuelven `Date`; el contrato IPC usa epoch ms en todo el
 * proyecto. La conversión vive aquí, en la frontera, y no se filtra ni hacia la
 * base de datos ni hacia el renderer.
 */
const toSummary = (row: {
  id: string
  name: string
  isDefault: boolean
  updatedAt: Date
}): LayoutSummary => ({
  id: row.id,
  name: row.name,
  isDefault: row.isDefault,
  updatedAt: row.updatedAt.getTime(),
})

const toRecord = (row: repository.LayoutRecord): LayoutRecord => ({
  ...toSummary(row),
  state: row.state,
})

export const list: IpcHandler<'layouts:list'> = async () =>
  (await repository.listLayouts()).map(toSummary)

export const get: IpcHandler<'layouts:get'> = async ({ id }) => {
  const found = await repository.getLayout(id)
  return found ? toRecord(found) : null
}

export const getDefault: IpcHandler<'layouts:getDefault'> = async () => {
  const found = await repository.getDefaultLayout()
  return found ? toRecord(found) : null
}

export const save: IpcHandler<'layouts:save'> = async ({ name, state }) => {
  try {
    return toRecord(await repository.saveLayout(name, state))
  } catch (error) {
    throw new AppError('DATABASE_ERROR', 'No se pudo guardar la disposición.', { cause: error })
  }
}

export const rename: IpcHandler<'layouts:rename'> = async ({ id, name }) => {
  try {
    await repository.renameLayout(id, name)
  } catch (error) {
    throw new AppError('NOT_FOUND', 'No existe esa disposición.', { cause: error })
  }
}

export const remove: IpcHandler<'layouts:delete'> = async ({ id }) => {
  try {
    await repository.deleteLayout(id)
  } catch (error) {
    throw new AppError('NOT_FOUND', 'No existe esa disposición.', { cause: error })
  }
}

export const setDefault: IpcHandler<'layouts:setDefault'> = async ({ id }) => {
  try {
    await repository.setDefaultLayout(id)
  } catch (error) {
    throw new AppError('NOT_FOUND', 'No existe esa disposición.', { cause: error })
  }
}
