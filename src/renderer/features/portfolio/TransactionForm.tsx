import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { inferAssetClass, isCanonicalSymbol } from '@shared/market/symbols'
import type { TransactionInput } from '@shared/domain'
import { cn } from '../../lib/cn'

/**
 * Alta de una operación.
 *
 * Valida antes de enviar, aunque el contrato IPC vuelva a validar en el otro
 * lado. No es duplicación: aquí el objetivo es decirle al usuario qué campo está
 * mal mientras lo escribe; allí es impedir que un dato inválido llegue a disco.
 * Si solo existiera la del contrato, el error llegaría como un fallo genérico
 * sin señalar el campo.
 */

/** Fecha de hoy en formato `yyyy-mm-dd` para el `input[type=date]`. */
function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

interface FormState {
  symbol: string
  side: 'buy' | 'sell'
  quantity: string
  pricePerUnit: string
  fees: string
  executedAt: string
  note: string
}

const emptyForm = (): FormState => ({
  symbol: '',
  side: 'buy',
  quantity: '',
  pricePerUnit: '',
  fees: '',
  executedAt: todayISO(),
  note: '',
})

/**
 * Convierte lo tecleado a número aceptando coma decimal.
 *
 * Un usuario con teclado español escribe «12,50» y `Number()` devolvería `NaN`.
 * Rechazar esa entrada sería tratarla como un error cuando es la forma normal de
 * escribir un decimal en la mitad del mundo.
 */
function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '') return null

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function TransactionForm({
  portfolioId,
  onSubmit,
  isPending,
  error,
}: {
  portfolioId: string
  onSubmit: (input: TransactionInput) => void
  isPending: boolean
  error: string | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [problem, setProblem] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }))
    setProblem(null)
  }

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()

    const symbol = form.symbol.trim().toUpperCase()
    if (!isCanonicalSymbol(symbol)) {
      setProblem(t('portfolio.errors.symbol'))
      return
    }

    const quantity = parseAmount(form.quantity)
    if (quantity === null || quantity <= 0) {
      setProblem(t('portfolio.errors.quantity'))
      return
    }

    const pricePerUnit = parseAmount(form.pricePerUnit)
    if (pricePerUnit === null || pricePerUnit < 0) {
      setProblem(t('portfolio.errors.price'))
      return
    }

    const fees = parseAmount(form.fees) ?? 0
    if (fees < 0) {
      setProblem(t('portfolio.errors.fees'))
      return
    }

    const executedAt = Date.parse(`${form.executedAt}T12:00:00`)
    if (Number.isNaN(executedAt)) {
      setProblem(t('portfolio.errors.date'))
      return
    }
    // Mediodía y no medianoche: con medianoche, un desplazamiento de zona
    // horaria mueve la operación al día anterior, y en una cartera la fecha
    // exacta importa.

    if (executedAt > Date.now()) {
      setProblem(t('portfolio.errors.future'))
      return
    }

    onSubmit({
      portfolioId,
      symbol,
      assetClass: inferAssetClass(symbol),
      side: form.side,
      quantity,
      pricePerUnit,
      fees,
      currency: 'USD',
      executedAt,
      note: form.note.trim() === '' ? null : form.note.trim(),
    })

    setForm(emptyForm())
  }

  const message = problem ?? error

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4"
    >
      <h3 className="text-xs font-medium tracking-wide text-content-muted uppercase">
        {t('portfolio.addTransaction')}
      </h3>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex overflow-hidden rounded-panel border border-edge">
          {(['buy', 'sell'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => set('side', side)}
              className={cn(
                'px-3 py-1.5 text-xs transition-colors duration-120',
                form.side === side
                  ? side === 'buy'
                    ? 'bg-positive/15 text-positive'
                    : 'bg-negative/15 text-negative'
                  : 'text-content-muted hover:text-content',
              )}
            >
              {t(`portfolio.side.${side}`)}
            </button>
          ))}
        </div>

        <Field label={t('panels.columns.symbol')} className="w-28">
          <input
            value={form.symbol}
            onChange={(event) => set('symbol', event.target.value.toUpperCase())}
            placeholder="AAPL"
            maxLength={32}
            className={inputClass}
          />
        </Field>

        <Field label={t('portfolio.quantity')} className="w-24">
          <input
            value={form.quantity}
            onChange={(event) => set('quantity', event.target.value)}
            inputMode="decimal"
            placeholder="10"
            className={cn(inputClass, 'tabular')}
          />
        </Field>

        <Field label={t('portfolio.pricePerUnit')} className="w-28">
          <input
            value={form.pricePerUnit}
            onChange={(event) => set('pricePerUnit', event.target.value)}
            inputMode="decimal"
            placeholder="150,00"
            className={cn(inputClass, 'tabular')}
          />
        </Field>

        <Field label={t('portfolio.fees')} className="w-24">
          <input
            value={form.fees}
            onChange={(event) => set('fees', event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className={cn(inputClass, 'tabular')}
          />
        </Field>

        <Field label={t('portfolio.date')} className="w-36">
          <input
            type="date"
            value={form.executedAt}
            max={todayISO()}
            onChange={(event) => set('executedAt', event.target.value)}
            className={cn(inputClass, 'tabular')}
          />
        </Field>

        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-panel bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-120 hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden />
          {t('common.add')}
        </button>
      </div>

      {message !== null && <p className="text-xs text-negative">{message}</p>}
    </form>
  )
}

const inputClass =
  'w-full rounded-panel border border-edge bg-base px-2 py-1.5 text-xs text-content outline-none transition-colors duration-120 placeholder:text-content-muted focus:border-accent'

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[10px] tracking-wide text-content-muted uppercase">{label}</span>
      {children}
    </label>
  )
}
