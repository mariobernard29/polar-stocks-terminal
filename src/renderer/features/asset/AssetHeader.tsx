import { useTranslation } from 'react-i18next'
import type { AssetClass, Quote } from '@shared/domain'
import { formatChange, formatPercent, formatPrice } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * Cabecera de la ficha de activo.
 *
 * El precio fuera de sesión se muestra **aparte** y solo cuando existe. Mezclar
 * el precio de after-hours con el de cierre en la misma cifra es un error grave
 * en una terminal: son precios formados en mercados con liquidez muy distinta y
 * no significan lo mismo.
 */
export function AssetHeader({
  symbol,
  name,
  assetClass,
  exchange,
  logoUrl,
  quote,
  isLoading,
  error,
}: {
  symbol: string
  name: string | null
  assetClass: AssetClass
  exchange: string | null
  logoUrl: string | null
  quote: Quote | null
  isLoading: boolean
  error: unknown
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  const positive = (quote?.changePercent ?? 0) >= 0
  const tone = positive ? 'text-positive' : 'text-negative'

  return (
    <header className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-6">
      <div className="flex items-start gap-4">
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className="size-10 shrink-0 rounded bg-elevated object-contain p-1"
            // Un logotipo roto no debe dejar un icono de imagen partida en una
            // ficha por lo demás correcta.
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        )}

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-content">{symbol}</h1>
            <span className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-content-muted">
              {t(`assetClass.${assetClass}`)}
            </span>
          </div>
          <p className="truncate text-sm text-content-secondary">
            {name ?? t('common.loading')}
            {exchange && <span className="text-content-muted"> · {exchange}</span>}
          </p>
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 flex-col items-end gap-1">
          {isLoading && <span className="text-sm text-content-muted">{t('common.loading')}</span>}

          {error !== null && error !== undefined && !isLoading && (
            <span className="text-sm text-negative">{t('common.noData')}</span>
          )}

          {quote && (
            <>
              <span className="tabular text-2xl font-semibold text-content">
                {formatPrice(quote.price, quote.currency, locale, assetClass)}
              </span>
              <span className={cn('tabular text-sm', tone)}>
                {formatChange(quote.change, locale)} ({formatPercent(quote.changePercent, locale)})
              </span>
              <span className="text-[10px] tracking-wide text-content-muted uppercase">
                {t(`session.${quote.marketState}`)}
              </span>
            </>
          )}
        </div>
      </div>

      {/*
        After-hours en su propia línea, nunca fundido con el precio de cierre:
        son precios formados en mercados con liquidez muy distinta.
      */}
      {quote?.extendedPrice != null && (
        <div className="flex items-baseline gap-2 border-t border-edge pt-3 text-xs">
          <span className="tracking-wide text-content-muted uppercase">
            {t(`session.${quote.marketState}`)}
          </span>
          <span className="tabular text-content">
            {formatPrice(quote.extendedPrice, quote.currency, locale, assetClass)}
          </span>
          {quote.extendedChangePercent != null && (
            <span
              className={cn(
                'tabular',
                quote.extendedChangePercent >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {formatPercent(quote.extendedChangePercent, locale)}
            </span>
          )}
        </div>
      )}
    </header>
  )
}
