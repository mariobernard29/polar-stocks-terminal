import { armNewAlert, getAlertCapabilities, refreshAlerts } from '../../alerts/engine'
import * as repo from '../../db/repositories/alerts'
import { AppError } from '../app-error'
import type { IpcHandler } from '../register'

/**
 * Alertas.
 *
 * Lo único que no es una llamada directa al repositorio es el `refreshAlerts()`
 * tras crear una: sin él, la alerta recién creada esperaría hasta un minuto a su
 * primera observación, y durante ese hueco un cruce pasaría desapercibido.
 */

const wrap = async <T>(operation: () => Promise<T>, message: string): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw new AppError('DATABASE_ERROR', message, { cause: error })
  }
}

export const list: IpcHandler<'alerts:list'> = () =>
  wrap(() => repo.listAlerts(), 'No se pudieron cargar las alertas.')

export const create: IpcHandler<'alerts:create'> = (input) =>
  wrap(async () => {
    const alert = await repo.createAlert(input)
    // Se arma con el valor actual antes de responder, y se devuelve si la
    // condición ya se cumplía: la pantalla lo advierte en el único momento en
    // que el usuario puede corregir el umbral.
    const armed = await armNewAlert(alert)
    return { alert, ...armed }
  }, 'No se pudo crear la alerta.')

export const setEnabled: IpcHandler<'alerts:setEnabled'> = ({ id, enabled }) =>
  wrap(async () => {
    const alert = await repo.setAlertEnabled(id, enabled)
    // Reactivar también rearma: el motor descarta el estado de las alertas
    // inactivas, así que la próxima vuelta la observa de nuevo desde cero.
    if (enabled) refreshAlerts()
    return alert
  }, 'No se pudo actualizar la alerta.')

export const remove: IpcHandler<'alerts:delete'> = ({ id }) =>
  wrap(() => repo.deleteAlert(id), 'No se pudo eliminar la alerta.')

export const triggers: IpcHandler<'alerts:triggers'> = ({ limit }) =>
  wrap(() => repo.listTriggers(limit), 'No se pudo cargar el historial de avisos.')

export const acknowledge: IpcHandler<'alerts:acknowledge'> = ({ id }) =>
  wrap(() => repo.acknowledgeTrigger(id), 'No se pudo marcar el aviso.')

export const acknowledgeAll: IpcHandler<'alerts:acknowledgeAll'> = () =>
  wrap(() => repo.acknowledgeAllTriggers(), 'No se pudieron marcar los avisos.')

export const capabilities: IpcHandler<'alerts:capabilities'> = () => getAlertCapabilities()
