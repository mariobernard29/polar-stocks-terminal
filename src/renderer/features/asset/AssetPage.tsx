import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { inferAssetClass } from '@shared/market/symbols'
import { getChartAdapter } from '../../charts/registry'
import { useRealtimeQuotes } from '../../hooks/use-realtime'
import { useSettings } from '../../hooks/use-settings'
import { ipc } from '../../lib/ipc'
import { formatCompact, formatPrice, formatRelative } from '../../lib/format'
import { cn } from '../../lib/cn'
import { AssetHeader } from './AssetHeader'
import { StatGrid } from './StatGrid'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Página de activo
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La ficha completa: cotización, gráfico, fundamentales, descripción y noticias.
 *
 * Cada bloque se pide por separado y **falla por separado**. Que FMP haya
 * agotado su cuota diaria no debe dejar la página en blanco: se muestra el
 * precio, el gráfico y las noticias, y solo falta la ficha corporativa. Una
 * consulta única para todo convertiría cualquier fallo parcial en pantalla
 * vacía.
 */
export function AssetPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const { symbol = '' } = useParams<{ symbol: string }>()

  const upper = symbol.toUpperCase()
  const assetClass = inferAssetClass(upper)
  const isCrypto = assetClass === 'crypto'

  useRealtimeQuotes([upper])

  const quote = useQuery({
    queryKey: ['quote', upper],
    queryFn: () => ipc.market.quote(upper),
    enabled: upper.length > 0,
  })

  const profile = useQuery({
    queryKey: ['profile', upper],
    queryFn: () => ipc.market.profile(upper),
    enabled: upper.length > 0 && !isCrypto,
    retry: false,
  })

  const metrics = useQuery({
    queryKey: ['cryptoMetrics', upper],
    queryFn: () => ipc.market.cryptoMetrics(upper),
    enabled: upper.length > 0 && isCrypto,
    retry: false,
  })

  const news = useQuery({
    queryKey: ['news', upper],
    queryFn: () => ipc.market.news({ symbol: upper, category: null, limit: 12 }),
    enabled: upper.length > 0,
    retry: false,
  })

  const adapter = getChartAdapter(settings['appearance.chartProvider'])
  const locale = i18n.language
  const name = profile.data?.name ?? metrics.data?.name ?? null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <AssetHeader
        symbol={upper}
        name={name}
        assetClass={assetClass}
        exchange={profile.data?.exchange ?? null}
        logoUrl={profile.data?.logoUrl ?? metrics.data?.logoUrl ?? null}
        quote={quote.data ?? null}
        isLoading={quote.isLoading}
        error={quote.error}
      />

      <div className="h-96 overflow-hidden rounded-panel border border-edge bg-surface">
        <adapter.Component
          symbol={upper}
          timeframe="1D"
          exchange={profile.data?.exchange ?? null}
        />
      </div>

      {/* Fundamentales de renta variable o métricas de cripto, según el activo. */}
      {isCrypto ? (
        <StatGrid
          title={t('asset.metrics')}
          isLoading={metrics.isLoading}
          error={metrics.error}
          stats={[
            { label: t('asset.marketCap'), value: fmt(metrics.data?.marketCap, locale) },
            {
              label: t('asset.rank'),
              value: metrics.data?.marketCapRank ? `#${metrics.data.marketCapRank}` : null,
            },
            { label: t('asset.volume24h'), value: fmt(metrics.data?.volume24h, locale) },
            {
              label: t('asset.circulating'),
              value: fmt(metrics.data?.circulatingSupply, locale),
            },
            { label: t('asset.totalSupply'), value: fmt(metrics.data?.totalSupply, locale) },
            {
              label: t('asset.maxSupply'),
              // `null` en supply máximo no es «cero»: significa que esa moneda
              // no tiene tope de emisión, como Ethereum. Decirlo es un dato.
              value: metrics.data
                ? (fmt(metrics.data.maxSupply, locale) ?? t('asset.noCap'))
                : null,
            },
            {
              label: t('asset.dominance'),
              value:
                metrics.data?.dominance != null
                  ? `${metrics.data.dominance.toFixed(2).replace('.', ',')} %`
                  : null,
            },
            {
              label: t('asset.allTimeHigh'),
              value:
                metrics.data?.allTimeHigh != null
                  ? formatPrice(metrics.data.allTimeHigh, 'USD', locale)
                  : null,
            },
          ]}
        />
      ) : (
        <StatGrid
          title={t('asset.fundamentals')}
          isLoading={profile.isLoading}
          error={profile.error}
          stats={[
            { label: t('asset.marketCap'), value: fmt(profile.data?.marketCap, locale) },
            { label: t('asset.pe'), value: num(profile.data?.peRatio, locale) },
            { label: t('asset.eps'), value: num(profile.data?.eps, locale) },
            {
              label: t('asset.dividendYield'),
              value:
                profile.data?.dividendYield != null
                  ? `${profile.data.dividendYield.toFixed(2).replace('.', ',')} %`
                  : null,
            },
            { label: t('asset.beta'), value: num(profile.data?.beta, locale) },
            {
              label: t('asset.range52'),
              value:
                profile.data?.weekLow52 != null && profile.data.weekHigh52 != null
                  ? `${formatPrice(profile.data.weekLow52, null, locale)} – ${formatPrice(profile.data.weekHigh52, null, locale)}`
                  : null,
            },
            { label: t('asset.volume'), value: fmt(quote.data?.volume, locale) },
            {
              label: t('asset.employees'),
              value: profile.data?.employees ? fmt(profile.data.employees, locale) : null,
            },
          ]}
        />
      )}

      {profile.data && (profile.data.description || profile.data.sector) && (
        <section className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-6">
          <h2 className="text-xs font-medium tracking-wide text-content-muted uppercase">
            {t('asset.about')}
          </h2>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs md:grid-cols-4">
            <Info label={t('asset.sector')} value={profile.data.sector} />
            <Info label={t('asset.industry')} value={profile.data.industry} />
            <Info label={t('asset.ceo')} value={profile.data.ceo} />
            <Info label={t('asset.country')} value={profile.data.country} />
          </dl>

          {profile.data.description && (
            <p className="text-selectable max-w-3xl text-xs leading-relaxed text-content-secondary">
              {profile.data.description}
            </p>
          )}

          {profile.data.website && (
            <button
              type="button"
              onClick={() => void ipc.app.openExternal(profile.data?.website ?? '')}
              className="flex items-center gap-1.5 self-start text-xs text-accent hover:underline"
            >
              {profile.data.website.replace(/^https?:\/\//, '')}
              <ExternalLink className="size-3" aria-hidden />
            </button>
          )}
        </section>
      )}

      {news.data && news.data.length > 0 && (
        <section className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-6">
          <h2 className="text-xs font-medium tracking-wide text-content-muted uppercase">
            {t('asset.news')}
          </h2>
          <ul className="divide-y divide-edge">
            {news.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void ipc.app.openExternal(item.url)}
                  className="group flex w-full flex-col gap-1 py-2.5 text-left transition-colors hover:bg-elevated"
                >
                  <span className="text-xs leading-snug text-content">{item.headline}</span>
                  <span className="flex gap-2 text-[10px] text-content-muted">
                    <span>{item.source}</span>
                    <span>·</span>
                    <span>{formatRelative(new Date(item.publishedAt), locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Cifras grandes en forma compacta: 4.537.071.141.960 no cabe ni se lee. */
function fmt(value: number | null | undefined, locale: string): string | null {
  return value == null ? null : formatCompact(value, locale)
}

function num(value: number | null | undefined, locale: string): string | null {
  return value == null
    ? null
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

function Info({ label, value }: { label: string; value: string | null }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-content-muted">{label}</dt>
      <dd className={cn('truncate', value ? 'text-content-secondary' : 'text-content-muted')}>
        {value ?? '—'}
      </dd>
    </div>
  )
}
