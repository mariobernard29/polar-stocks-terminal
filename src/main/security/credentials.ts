import { safeStorage } from 'electron'
import { getPrisma } from '../db/client'
import { AppError } from '../ipc/app-error'
import { logger } from '../lib/logger'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Almacén de credenciales
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Las API keys se cifran con `safeStorage`, que en Windows delega en DPAPI, en
 * macOS en el Llavero y en Linux en el keyring de escritorio. El resultado es un
 * blob que solo puede descifrar la misma cuenta de usuario en la misma máquina.
 *
 * Tres reglas que no se negocian:
 *
 *   1. Nunca se escribe una clave en claro en disco.
 *   2. Nunca sale una clave hacia el renderer — ni siquiera para mostrarla en
 *      Configuración. La interfaz recibe una máscara calculada aquí.
 *   3. Nunca se registra una clave en el log, ni entera ni troceada.
 *
 * El renderer no necesita las claves porque no llama a ningún proveedor: todas
 * las peticiones externas salen del proceso main.
 */

export interface CredentialSummary {
  readonly provider: string
  readonly hasSecret: boolean
  /** Forma enmascarada, p. ej. "••••••••cd12". Nunca la clave real. */
  readonly masked: string | null
  readonly enabled: boolean
  readonly priority: number
  readonly lastCheckedAt: Date | null
  readonly lastCheckOk: boolean | null
  readonly lastCheckNote: string | null
}

/**
 * Si el sistema operativo no ofrece cifrado, se rechaza guardar.
 *
 * La alternativa —guardar en claro con un aviso— convierte un fallo visible en
 * una fuga silenciosa. Es preferible que el usuario sepa que no puede usar esa
 * función en su equipo tal como está configurado.
 */
function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError(
      'INTERNAL',
      'El sistema no ofrece almacenamiento cifrado, así que no se guardará ninguna clave.',
      {
        details:
          'En Linux suele resolverse instalando un keyring de escritorio (gnome-keyring o kwallet).',
      },
    )
  }
}

function mask(secret: string): string {
  const visible = secret.slice(-4)
  return `${'•'.repeat(8)}${visible}`
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/** Guarda (o reemplaza) la clave de un proveedor. */
export async function setCredential(provider: string, apiKey: string): Promise<void> {
  assertEncryptionAvailable()

  const trimmed = apiKey.trim()
  if (trimmed.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'La clave no puede estar vacía.')
  }

  // Prisma 7 tipa las columnas Bytes como `Uint8Array<ArrayBuffer>`, mientras
  // que safeStorage devuelve un `Buffer` (respaldado por un pool compartido).
  // La copia explícita satisface el tipo y además desliga el blob del pool.
  const encrypted = new Uint8Array(safeStorage.encryptString(trimmed))

  await getPrisma().apiCredential.upsert({
    where: { provider },
    create: { provider, secret: encrypted },
    update: { secret: encrypted, lastCheckedAt: null, lastCheckOk: null, lastCheckNote: null },
  })

  // Se registra el hecho, jamás el valor.
  logger.info(`[credentials] clave guardada para ${provider}`)
}

/**
 * Descifra la clave de un proveedor. **Solo para uso dentro del proceso main.**
 *
 * Devuelve `null` si no hay clave o si no se puede descifrar (por ejemplo,
 * porque el perfil del usuario cambió y DPAPI ya no puede abrir el blob).
 */
export async function getCredential(provider: string): Promise<string | null> {
  const row = await getPrisma().apiCredential.findUnique({
    where: { provider },
    select: { secret: true },
  })

  if (!row?.secret) return null
  if (!safeStorage.isEncryptionAvailable()) return null

  try {
    return safeStorage.decryptString(Buffer.from(row.secret))
  } catch (error) {
    logger.warn(`[credentials] no se pudo descifrar la clave de ${provider}`, error)
    return null
  }
}

export async function removeCredential(provider: string): Promise<void> {
  await getPrisma().apiCredential.update({
    where: { provider },
    data: { secret: null, lastCheckedAt: null, lastCheckOk: null, lastCheckNote: null },
  })
  logger.info(`[credentials] clave eliminada para ${provider}`)
}

/** Habilita/deshabilita o reordena un proveedor sin tocar su clave. */
export async function setProviderConfig(
  provider: string,
  config: { enabled?: boolean; priority?: number },
): Promise<void> {
  await getPrisma().apiCredential.upsert({
    where: { provider },
    create: { provider, enabled: config.enabled ?? true, priority: config.priority ?? 100 },
    update: config,
  })
}

/**
 * Resumen de todas las credenciales para la pantalla de Configuración.
 *
 * La máscara se calcula aquí descifrando en el main; lo que cruza el IPC son
 * solo puntos y los cuatro últimos caracteres.
 */
export async function listCredentials(): Promise<CredentialSummary[]> {
  const rows = await getPrisma().apiCredential.findMany({ orderBy: { priority: 'asc' } })
  const encryptionAvailable = safeStorage.isEncryptionAvailable()

  return rows.map((row) => {
    let masked: string | null = null

    if (row.secret && encryptionAvailable) {
      try {
        masked = mask(safeStorage.decryptString(Buffer.from(row.secret)))
      } catch {
        masked = '(no se pudo descifrar)'
      }
    }

    return {
      provider: row.provider,
      hasSecret: row.secret !== null,
      masked,
      enabled: row.enabled,
      priority: row.priority,
      lastCheckedAt: row.lastCheckedAt,
      lastCheckOk: row.lastCheckOk,
      lastCheckNote: row.lastCheckNote,
    }
  })
}
