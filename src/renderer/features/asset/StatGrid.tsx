import { useTranslation } from 'react-i18next'
import { PolarError } from '@shared/ipc/error-codes'

export interface Stat {
  readonly label: string
  readonly value: string | null
}

/**
 * Rejilla de cifras clave.
 *
 * Un dato ausente se muestra como `—`, nunca como cero. En una ficha financiera
 * la diferencia importa: «este proveedor no da el PER» y «el PER es cero» son
 * cosas distintas, y la segunda es información falsa.
 */
export function StatGrid({
  title,
  stats,
  isLoading,
  error,
}: {
  title: string
  stats: readonly Stat[]
  isLoading: boolean
  error: unknown
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xs font-medium tracking-wide text-content-muted uppercase">{title}</h2>

        {/*
          Un fallo aquí no vacía la página: se dice qué falta y por qué, y el
          resto de la ficha —precio, gráfico, noticias— sigue siendo útil.
        */}
        {error !== null && error !== undefined && (
          <span className="text-[10px] text-warning">
            {error instanceof PolarError ? error.message : t('common.noData')}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <dt className="text-[10px] tracking-wide text-content-muted uppercase">{stat.label}</dt>
            <dd className="tabular text-sm text-content">
              {isLoading ? (
                <span className="text-content-muted">·</span>
              ) : (
                (stat.value ?? <span className="text-content-muted">—</span>)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
