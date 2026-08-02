import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Info } from 'lucide-react'
import type { ScreenerPreset } from '@shared/domain'
import { ipc } from '../../lib/ipc'
import { formatCompact, formatPercent, formatPrice } from '../../lib/format'
import { cn } from '../../lib/cn'

type Universe = 'stock' | 'crypto'

/**
 * Preajustes por universo.
 *
 * Las criptomonedas admiten ordenación por capitalización porque CoinGecko la
 * ofrece; la renta variable no, porque el endpoint de screener con filtros de
 * FMP es de pago. Listar solo lo que funciona evita ofrecer un botón que
 * devolvería un error de suscripción.
 */
const PRESETS: Readonly<Record<Universe, readonly ScreenerPreset[]>> = {
  stock: ['gainers', 'losers', 'actives'],
  crypto: ['marketCap', 'gainers', 'losers', 'actives'],
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Screeners
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Movimientos de mercado completo para acciones y criptomonedas.
 *
 * **No hay filtros libres** (PER, sector, dividendo, beta): ese endpoint
 * responde 402 en el plan gratuito de FMP. Se dice en la propia pantalla en vez
 * de mostrar un formulario que no funcionaría.
 */
export function ScreenersPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [universe, setUniverse] = useState<Universe>('stock')
  const [preset, setPreset] = useState<ScreenerPreset>('gainers')

  const rows = useQuery({
    queryKey: ['screener', universe, preset],
    queryFn: () => ipc.market.screener({ assetClass: universe, preset, limit: 40 }),
    retry: false,
  })

  const selectUniverse = (next: Universe): void => {
    setUniverse(next)
    // El preajuste activo puede no existir en el otro universo.
    if (!PRESETS[next].includes(preset)) setPreset(PRESETS[next][0] ?? 'gainers')
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-content">{t('pages.screeners.title')}</h1>
          <p className="text-sm text-content-secondary">{t('pages.screeners.description')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['stock', 'crypto'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => selectUniverse(value)}
              className={cn(
                'rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
                universe === value
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-edge text-content-secondary hover:border-edge-strong hover:text-content',
              )}
            >
              {t(`assetClass.${value}`)}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-edge" />

          {PRESETS[universe].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreset(value)}
              className={cn(
                'rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
                preset === value
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-edge text-content-secondary hover:border-edge-strong hover:text-content',
              )}
            >
              {t(`screener.${value}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-panel border border-edge bg-elevated p-3">
        <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
        <p className="text-xs leading-relaxed text-content-muted">{t('screener.noCustom')}</p>
      </div>

      {rows.isLoading && (
        <p className="py-10 text-center text-sm text-content-muted">{t('common.loading')}</p>
      )}

      {!rows.isLoading && (rows.data?.length ?? 0) === 0 && (
        <p className="rounded-panel border border-edge bg-surface p-10 text-center text-sm text-content-muted">
          {t('common.noData')}
        </p>
      )}

      {(rows.data?.length ?? 0) > 0 && (
        <table className="w-full overflow-hidden rounded-panel border border-edge bg-surface text-xs">
          <thead>
            <tr className="border-b border-edge text-content-muted">
              <th className="px-4 py-2 text-left font-normal">#</th>
              <th className="px-2 py-2 text-left font-normal">{t('panels.columns.symbol')}</th>
              <th className="px-2 py-2 text-left font-normal">{t('screener.name')}</th>
              <th className="px-2 py-2 text-right font-normal">{t('panels.columns.price')}</th>
              <th className="px-2 py-2 text-right font-normal">{t('panels.columns.changePct')}</th>
              <th className="px-2 py-2 text-right font-normal">{t('asset.marketCap')}</th>
              <th className="px-4 py-2 text-right font-normal">{t('asset.volume')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.data?.map((row, index) => (
              <tr
                key={row.symbol}
                onClick={() => void navigate(`/activo/${encodeURIComponent(row.symbol)}`)}
                className="cursor-pointer border-t border-edge transition-colors hover:bg-elevated"
              >
                {/*
                  Posición en **esta** lista, no el puesto por capitalización.
                  Mezclarlos daba resultados absurdos: el primer resultado de
                  «mayores subidas» aparecía numerado como 5209, que es su rango
                  global por capitalización y no dice nada sobre la ordenación
                  que el usuario está viendo.
                */}
                <td className="tabular px-4 py-1.5 text-content-muted">{index + 1}</td>
                <td className="px-2 py-1.5 text-content">{row.symbol}</td>
                <td className="max-w-56 truncate px-2 py-1.5 text-content-muted">{row.name}</td>
                <td className="tabular px-2 py-1.5 text-right text-content">
                  {formatPrice(row.price, 'USD', i18n.language, row.assetClass)}
                </td>
                <td
                  className={cn(
                    'tabular px-2 py-1.5 text-right',
                    row.changePercent >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {formatPercent(row.changePercent, i18n.language)}
                </td>
                {/* `—` y no cero: estos endpoints de renta variable no traen
                    capitalización ni volumen, y fingir un cero sería falso. */}
                <td className="tabular px-2 py-1.5 text-right text-content-secondary">
                  {row.marketCap !== null ? formatCompact(row.marketCap, i18n.language) : '—'}
                </td>
                <td className="tabular px-4 py-1.5 text-right text-content-secondary">
                  {row.volume !== null ? formatCompact(row.volume, i18n.language) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
