import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Trash2 } from 'lucide-react'
import type { TransactionInput, TransactionRecord } from '@shared/domain'
import { PolarError } from '@shared/ipc/error-codes'
import { ipc } from '../../lib/ipc'
import { formatDateTime, formatPercent, formatPrice } from '../../lib/format'
import { cn } from '../../lib/cn'
import { TransactionForm } from './TransactionForm'
import { usePortfolio, type PortfolioView } from './use-portfolio'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Portafolio
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Posiciones, rentabilidad e historial de operaciones.
 *
 * Las posiciones se derivan del historial, no se guardan: el historial es la
 * única fuente de verdad. Borrar una operación recalcula todo, que es lo que un
 * usuario espera al corregir una entrada mal tecleada.
 *
 * Los precios son de mercado real; el coste medio es lo que el usuario haya
 * introducido. Cuando falta una cotización se dice explícitamente en lugar de
 * contar esa posición como cero, que abultaría la pérdida sin avisar.
 */

type Tab = 'positions' | 'history'

export function PortfolioPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('positions')

  const portfolios = useQuery({
    queryKey: ['portfolio', 'list'],
    queryFn: () => ipc.portfolio.list(),
  })

  // La primera cartera es la activa. La gestión de varias carteras llegará
  // cuando haya con qué compararlas; hoy sería un selector con un solo elemento.
  const active = portfolios.data?.[0]
  const { positions, summary, isLoading, missingPrices } = usePortfolio(active?.id)

  const transactions = useQuery({
    queryKey: ['portfolio', 'transactions', active?.id],
    queryFn: () => ipc.portfolio.transactions(active?.id ?? ''),
    enabled: Boolean(active?.id),
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['portfolio'] })
  }

  const addTransaction = useMutation({
    mutationFn: (input: TransactionInput) => ipc.portfolio.addTransaction(input),
    onSuccess: invalidate,
  })

  const deleteTransaction = useMutation({
    mutationFn: (id: string) => ipc.portfolio.deleteTransaction(id),
    onSuccess: invalidate,
  })

  const open = positions.filter((position) => position.quantity > 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-content">{t('pages.portfolio.title')}</h1>
        <p className="text-sm text-content-secondary">{t('pages.portfolio.description')}</p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Metric
          label={t('portfolio.marketValue')}
          value={formatPrice(summary.marketValue, 'USD', i18n.language)}
        />
        <Metric
          label={t('portfolio.costBasis')}
          value={formatPrice(summary.costBasis, 'USD', i18n.language)}
        />
        <Metric
          label={t('portfolio.unrealized')}
          value={formatPrice(summary.unrealizedPnl, 'USD', i18n.language)}
          hint={
            summary.unrealizedPnlPercent !== null
              ? formatPercent(summary.unrealizedPnlPercent, i18n.language)
              : undefined
          }
          tone={summary.unrealizedPnl >= 0 ? 'positive' : 'negative'}
        />
        <Metric
          label={t('portfolio.totalPnl')}
          value={formatPrice(summary.totalPnl, 'USD', i18n.language)}
          hint={t('portfolio.totalPnlHint', {
            realized: formatPrice(summary.realizedPnl, 'USD', i18n.language),
            dividends: formatPrice(summary.dividends, 'USD', i18n.language),
          })}
          tone={summary.totalPnl >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {/*
        Aviso, no silencio. Si falta el precio de una posición, el valor de
        mercado que se muestra arriba está incompleto; presentarlo como una
        cifra cerrada sería mentir por omisión.
      */}
      {missingPrices.length > 0 && (
        <div className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-xs leading-relaxed text-content-secondary">
            {t('portfolio.missingPrices', { symbols: missingPrices.join(', ') })}
          </p>
        </div>
      )}

      {active && (
        <TransactionForm
          portfolioId={active.id}
          onSubmit={(input) => addTransaction.mutate(input)}
          isPending={addTransaction.isPending}
          error={addTransaction.error instanceof PolarError ? addTransaction.error.message : null}
        />
      )}

      <div className="flex gap-1.5">
        {(['positions', 'history'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'rounded-panel border px-3 py-1 text-xs transition-colors duration-120',
              tab === value
                ? 'border-accent bg-accent-muted text-accent'
                : 'border-edge text-content-secondary hover:border-edge-strong hover:text-content',
            )}
          >
            {t(`portfolio.tabs.${value}`)}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="py-10 text-center text-sm text-content-muted">{t('common.loading')}</p>
      )}

      {!isLoading && tab === 'positions' && (
        <PositionsTable positions={open} emptyLabel={t('portfolio.empty')} />
      )}

      {tab === 'history' && (
        <HistoryTable
          transactions={transactions.data ?? []}
          onDelete={(id) => deleteTransaction.mutate(id)}
          emptyLabel={t('portfolio.empty')}
        />
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative'
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-panel border border-edge bg-surface p-4">
      <span className="text-[10px] tracking-wide text-content-muted uppercase">{label}</span>
      <span
        className={cn(
          'tabular text-lg font-medium',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === undefined && 'text-content',
        )}
      >
        {value}
      </span>
      {hint !== undefined && <span className="text-[10px] text-content-muted">{hint}</span>}
    </div>
  )
}

function PositionsTable({
  positions,
  emptyLabel,
}: {
  positions: PortfolioView['positions']
  emptyLabel: string
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  if (positions.length === 0) {
    return (
      <p className="rounded-panel border border-edge bg-surface p-10 text-center text-sm text-content-muted">
        {emptyLabel}
      </p>
    )
  }

  return (
    <table className="w-full overflow-hidden rounded-panel border border-edge bg-surface text-xs">
      <thead>
        <tr className="border-b border-edge text-content-muted">
          <th className="px-4 py-2 text-left font-normal">{t('panels.columns.symbol')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('portfolio.quantity')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('portfolio.averageCost')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('panels.columns.price')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('portfolio.marketValue')}</th>
          <th className="px-4 py-2 text-right font-normal">{t('portfolio.unrealized')}</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr
            key={position.symbol}
            onClick={() => void navigate(`/activo/${encodeURIComponent(position.symbol)}`)}
            className="cursor-pointer border-t border-edge transition-colors hover:bg-elevated"
          >
            <td className="px-4 py-2 text-content">{position.symbol}</td>
            <td className="tabular px-2 py-2 text-right text-content-secondary">
              {position.quantity.toLocaleString(i18n.language, { maximumFractionDigits: 8 })}
            </td>
            <td className="tabular px-2 py-2 text-right text-content-secondary">
              {formatPrice(position.averageCost, 'USD', i18n.language, position.assetClass)}
            </td>
            {/* `—` y no cero cuando falta la cotización: un cero aquí se leería
                como «vale nada», que es una afirmación que no podemos hacer. */}
            <td className="tabular px-2 py-2 text-right text-content">
              {position.price !== null
                ? formatPrice(position.price, 'USD', i18n.language, position.assetClass)
                : '—'}
            </td>
            <td className="tabular px-2 py-2 text-right text-content">
              {position.marketValue !== null
                ? formatPrice(position.marketValue, 'USD', i18n.language)
                : '—'}
            </td>
            <td
              className={cn(
                'tabular px-4 py-2 text-right',
                position.unrealizedPnl === null
                  ? 'text-content-muted'
                  : position.unrealizedPnl >= 0
                    ? 'text-positive'
                    : 'text-negative',
              )}
            >
              {position.unrealizedPnl !== null ? (
                <>
                  {formatPrice(position.unrealizedPnl, 'USD', i18n.language)}
                  {position.unrealizedPnlPercent !== null && (
                    <span className="ml-1.5 text-[10px] opacity-70">
                      {formatPercent(position.unrealizedPnlPercent, i18n.language)}
                    </span>
                  )}
                </>
              ) : (
                '—'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HistoryTable({
  transactions,
  onDelete,
  emptyLabel,
}: {
  transactions: readonly TransactionRecord[]
  onDelete: (id: string) => void
  emptyLabel: string
}): React.JSX.Element {
  const { t, i18n } = useTranslation()

  if (transactions.length === 0) {
    return (
      <p className="rounded-panel border border-edge bg-surface p-10 text-center text-sm text-content-muted">
        {emptyLabel}
      </p>
    )
  }

  return (
    <table className="w-full overflow-hidden rounded-panel border border-edge bg-surface text-xs">
      <thead>
        <tr className="border-b border-edge text-content-muted">
          <th className="px-4 py-2 text-left font-normal">{t('portfolio.date')}</th>
          <th className="px-2 py-2 text-left font-normal">{t('panels.columns.symbol')}</th>
          <th className="px-2 py-2 text-left font-normal">{t('portfolio.operation')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('portfolio.quantity')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('portfolio.pricePerUnit')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('portfolio.fees')}</th>
          <th className="px-2 py-2 text-right font-normal">{t('portfolio.total')}</th>
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => {
          const gross = transaction.quantity * transaction.pricePerUnit
          // El total es lo que salió (compra) o entró (venta) de la cuenta: en
          // una compra las comisiones suman, en una venta restan.
          const total =
            transaction.side === 'buy' ? gross + transaction.fees : gross - transaction.fees

          return (
            <tr key={transaction.id} className="border-t border-edge hover:bg-elevated">
              <td className="tabular px-4 py-2 text-content-muted">
                {formatDateTime(new Date(transaction.executedAt), i18n.language)}
              </td>
              <td className="px-2 py-2 text-content">{transaction.symbol}</td>
              <td
                className={cn(
                  'px-2 py-2',
                  transaction.side === 'buy' ? 'text-positive' : 'text-negative',
                )}
              >
                {t(`portfolio.side.${transaction.side}`)}
              </td>
              <td className="tabular px-2 py-2 text-right text-content-secondary">
                {transaction.quantity.toLocaleString(i18n.language, { maximumFractionDigits: 8 })}
              </td>
              <td className="tabular px-2 py-2 text-right text-content-secondary">
                {formatPrice(
                  transaction.pricePerUnit,
                  transaction.currency,
                  i18n.language,
                  transaction.assetClass,
                )}
              </td>
              <td className="tabular px-2 py-2 text-right text-content-muted">
                {transaction.fees > 0
                  ? formatPrice(transaction.fees, transaction.currency, i18n.language)
                  : '—'}
              </td>
              <td className="tabular px-2 py-2 text-right text-content">
                {formatPrice(total, transaction.currency, i18n.language)}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(transaction.id)}
                  aria-label={t('common.delete')}
                  className="text-content-muted transition-colors hover:text-negative"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
