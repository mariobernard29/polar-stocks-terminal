import * as repo from '../../db/repositories/portfolio'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

/**
 * Portafolio.
 *
 * Capa fina: la validación ya la hizo el contrato antes de llegar aquí y el
 * cálculo vive en `@shared/portfolio`. Lo único propio de este archivo es
 * traducir los fallos de base de datos a errores que la interfaz sepa mostrar.
 */

const wrap = async <T>(operation: () => Promise<T>, message: string): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw new AppError('DATABASE_ERROR', message, { cause: error })
  }
}

export const list: IpcHandler<'portfolio:list'> = () =>
  wrap(async () => {
    // Se asegura de que exista una cartera antes de listar: así la pantalla
    // nunca aparece pidiendo «crea una cartera primero» antes de dejar anotar
    // la primera compra.
    await repo.ensureDefaultPortfolio()
    return repo.listPortfolios()
  }, 'No se pudieron cargar las carteras.')

export const create: IpcHandler<'portfolio:create'> = ({ name, currency }) =>
  wrap(() => repo.createPortfolio(name, currency), 'No se pudo crear la cartera.')

export const rename: IpcHandler<'portfolio:rename'> = ({ id, name }) =>
  wrap(() => repo.renamePortfolio(id, name), 'No se pudo renombrar la cartera.')

export const remove: IpcHandler<'portfolio:delete'> = ({ id }) =>
  wrap(() => repo.deletePortfolio(id), 'No se pudo eliminar la cartera.')

export const transactions: IpcHandler<'portfolio:transactions'> = ({ portfolioId, symbol }) =>
  wrap(() => repo.listTransactions(portfolioId, symbol), 'No se pudo cargar el historial.')

export const addTransaction: IpcHandler<'portfolio:addTransaction'> = (input) =>
  wrap(() => repo.addTransaction(input), 'No se pudo registrar la operación.')

export const deleteTransaction: IpcHandler<'portfolio:deleteTransaction'> = ({ id }) =>
  wrap(() => repo.deleteTransaction(id), 'No se pudo eliminar la operación.')

export const positions: IpcHandler<'portfolio:positions'> = ({ portfolioId }) =>
  wrap(() => repo.listPositions(portfolioId), 'No se pudieron calcular las posiciones.')

export const dividends: IpcHandler<'portfolio:dividends'> = ({ portfolioId }) =>
  wrap(() => repo.listDividends(portfolioId), 'No se pudieron cargar los dividendos.')

export const addDividend: IpcHandler<'portfolio:addDividend'> = (input) =>
  wrap(() => repo.addDividend(input), 'No se pudo registrar el dividendo.')

export const deleteDividend: IpcHandler<'portfolio:deleteDividend'> = ({ id }) =>
  wrap(() => repo.deleteDividend(id), 'No se pudo eliminar el dividendo.')
