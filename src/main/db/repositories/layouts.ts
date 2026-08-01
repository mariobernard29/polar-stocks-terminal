import { getPrisma } from '../client'

/**
 * Repositorio de disposiciones de paneles.
 *
 * `state` es la serialización de dockview: un formato opaco que se guarda y se
 * devuelve tal cual. Deliberadamente no lo interpretamos — si dockview cambia
 * su formato interno, esto no se entera.
 */

export interface LayoutSummary {
  id: string
  name: string
  isDefault: boolean
  updatedAt: Date
}

export interface LayoutRecord extends LayoutSummary {
  state: string
}

export async function listLayouts(): Promise<LayoutSummary[]> {
  return getPrisma().layout.findMany({
    select: { id: true, name: true, isDefault: true, updatedAt: true },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })
}

export async function getLayout(id: string): Promise<LayoutRecord | null> {
  return getPrisma().layout.findUnique({
    where: { id },
    select: { id: true, name: true, isDefault: true, updatedAt: true, state: true },
  })
}

/** La disposición que se abre al arrancar. */
export async function getDefaultLayout(): Promise<LayoutRecord | null> {
  return getPrisma().layout.findFirst({
    where: { isDefault: true },
    select: { id: true, name: true, isDefault: true, updatedAt: true, state: true },
  })
}

/** Crea o actualiza por nombre. Guardar dos veces con el mismo nombre sobrescribe. */
export async function saveLayout(name: string, state: string): Promise<LayoutRecord> {
  return getPrisma().layout.upsert({
    where: { name },
    create: { name, state },
    update: { state },
    select: { id: true, name: true, isDefault: true, updatedAt: true, state: true },
  })
}

export async function renameLayout(id: string, name: string): Promise<void> {
  await getPrisma().layout.update({ where: { id }, data: { name } })
}

export async function deleteLayout(id: string): Promise<void> {
  await getPrisma().layout.delete({ where: { id } })
}

/**
 * Marca una disposición como predeterminada.
 *
 * En una transacción porque son dos escrituras que deben verse como una: si se
 * quedara a medias habría dos predeterminadas, o ninguna.
 */
export async function setDefaultLayout(id: string): Promise<void> {
  const prisma = getPrisma()
  await prisma.$transaction([
    prisma.layout.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.layout.update({ where: { id }, data: { isDefault: true } }),
  ])
}
