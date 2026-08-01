import type {
  AlertCondition,
  AlertInput,
  AlertKind,
  AlertRecord,
  AlertTriggerRecord,
  AssetClass,
} from '@shared/domain'
import { getPrisma } from '../client'

/**
 * Repositorio de alertas.
 *
 * El esquema guarda `kind` y `condition` como texto porque SQLite no tiene
 * enums. Al leer se estrechan al tipo del contrato: una fila con un valor que no
 * corresponde solo puede venir de una versión futura o de una edición manual del
 * archivo, y en ambos casos es mejor descartarla que dejar que se propague un
 * tipo que el resto del código da por imposible.
 */

const KINDS = new Set<string>(['price', 'changePercent'])
const CONDITIONS = new Set<string>(['above', 'below'])

interface AlertRow {
  id: string
  symbol: string
  assetClass: string
  kind: string
  condition: string
  threshold: unknown
  enabled: boolean
  once: boolean
  createdAt: Date
  triggers?: { triggeredAt: Date }[]
}

function toAlert(row: AlertRow): AlertRecord | null {
  if (!KINDS.has(row.kind) || !CONDITIONS.has(row.condition)) return null

  const threshold = Number(row.threshold)
  if (!Number.isFinite(threshold)) return null

  return {
    id: row.id,
    symbol: row.symbol,
    assetClass: row.assetClass as AssetClass,
    kind: row.kind as AlertKind,
    condition: row.condition as AlertCondition,
    threshold,
    enabled: row.enabled,
    once: row.once,
    createdAt: row.createdAt.getTime(),
    lastTriggeredAt: row.triggers?.[0]?.triggeredAt.getTime() ?? null,
  }
}

/** Incluye el último disparo de cada alerta, que la lista muestra. */
const withLastTrigger = {
  triggers: { orderBy: { triggeredAt: 'desc' }, take: 1, select: { triggeredAt: true } },
} as const

export async function listAlerts(): Promise<AlertRecord[]> {
  const rows = await getPrisma().alert.findMany({
    orderBy: { createdAt: 'desc' },
    include: withLastTrigger,
  })

  return rows.map(toAlert).filter((alert): alert is AlertRecord => alert !== null)
}

/** Solo las activas. Es lo único que el motor necesita evaluar. */
export async function listEnabledAlerts(): Promise<AlertRecord[]> {
  const rows = await getPrisma().alert.findMany({
    where: { enabled: true },
    include: withLastTrigger,
  })

  return rows.map(toAlert).filter((alert): alert is AlertRecord => alert !== null)
}

export async function createAlert(input: AlertInput): Promise<AlertRecord> {
  const row = await getPrisma().alert.create({
    data: {
      symbol: input.symbol.toUpperCase(),
      assetClass: input.assetClass,
      kind: input.kind,
      condition: input.condition,
      threshold: input.threshold,
      once: input.once,
      enabled: true,
    },
    include: withLastTrigger,
  })

  const alert = toAlert(row)
  // No puede ser `null`: los valores acaban de pasar por el esquema del
  // contrato. Si lo fuera, el fallo estaría en `toAlert` y conviene enterarse.
  if (!alert) throw new Error('La alerta recién creada no pasó la validación de lectura.')
  return alert
}

export async function setAlertEnabled(id: string, enabled: boolean): Promise<AlertRecord> {
  const row = await getPrisma().alert.update({
    where: { id },
    data: { enabled },
    include: withLastTrigger,
  })

  const alert = toAlert(row)
  if (!alert) throw new Error('La alerta actualizada no pasó la validación de lectura.')
  return alert
}

export async function deleteAlert(id: string): Promise<void> {
  await getPrisma().alert.delete({ where: { id } })
}

// ─── Disparos ────────────────────────────────────────────────────────────────

export async function recordTrigger(
  alert: AlertRecord,
  value: number,
  message: string,
): Promise<AlertTriggerRecord> {
  const row = await getPrisma().alertTrigger.create({
    data: { alertId: alert.id, value, message },
  })

  return {
    id: row.id,
    alertId: alert.id,
    symbol: alert.symbol,
    kind: alert.kind,
    condition: alert.condition,
    threshold: alert.threshold,
    value,
    message,
    triggeredAt: row.triggeredAt.getTime(),
    acknowledged: row.acknowledged,
  }
}

export async function listTriggers(limit: number): Promise<AlertTriggerRecord[]> {
  const rows = await getPrisma().alertTrigger.findMany({
    orderBy: { triggeredAt: 'desc' },
    take: limit,
    include: {
      alert: {
        select: { symbol: true, kind: true, condition: true, threshold: true },
      },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    alertId: row.alertId,
    symbol: row.alert.symbol,
    // La alerta pudo crearse con un tipo que ya no se ofrece; el historial no
    // debe romperse por eso, así que se cae a los valores por defecto.
    kind: (KINDS.has(row.alert.kind) ? row.alert.kind : 'price') as AlertKind,
    condition: (CONDITIONS.has(row.alert.condition)
      ? row.alert.condition
      : 'above') as AlertCondition,
    threshold: Number(row.alert.threshold ?? 0),
    value: row.value === null ? null : Number(row.value),
    message: row.message,
    triggeredAt: row.triggeredAt.getTime(),
    acknowledged: row.acknowledged,
  }))
}

export async function acknowledgeTrigger(id: string): Promise<void> {
  await getPrisma().alertTrigger.update({ where: { id }, data: { acknowledged: true } })
}

export async function acknowledgeAllTriggers(): Promise<void> {
  await getPrisma().alertTrigger.updateMany({
    where: { acknowledged: false },
    data: { acknowledged: true },
  })
}
