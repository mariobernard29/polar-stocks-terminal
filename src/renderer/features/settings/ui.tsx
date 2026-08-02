import { cn } from '../../lib/cn'

/**
 * Primitivas de la pantalla de Configuración.
 *
 * Existen para que las ocho secciones se vean iguales sin repetir la misma
 * maquetación ocho veces. Si mañana cambia el espaciado de un campo, cambia en
 * un sitio.
 */

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-5 rounded-panel border border-edge bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-content">{title}</h2>
        {description && <p className="text-xs leading-relaxed text-content-muted">{description}</p>}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: string
  hint?: string
  children?: React.ReactNode
  /** Para controles anchos (tablas, listas) que no caben junto a la etiqueta. */
  stacked?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('flex gap-4', stacked ? 'flex-col' : 'items-start justify-between gap-8')}>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-content">{label}</span>
        {hint && <span className="text-xs leading-relaxed text-content-muted">{hint}</span>}
      </div>
      {children && <div className={cn(stacked ? 'w-full' : 'shrink-0')}>{children}</div>}
    </div>
  )
}

export function Choice<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onSelect: (value: T) => void
}): React.JSX.Element {
  return (
    <div className="flex gap-1 rounded-panel border border-edge bg-elevated p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'rounded px-3 py-1 text-xs transition-colors duration-120',
            value === option.value
              ? 'bg-accent text-white'
              : 'text-content-secondary hover:bg-overlay hover:text-content',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-160',
        checked ? 'bg-accent' : 'bg-edge-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-4 rounded-full bg-white transition-transform duration-160 ease-out',
          checked ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      {...props}
      className={cn(
        'h-8 rounded-panel border border-edge bg-elevated px-2.5 text-xs text-content outline-none',
        'placeholder:text-content-muted focus:border-accent',
        props.className,
      )}
    />
  )
}

export function Button({
  variant = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger'
}): React.JSX.Element {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'h-8 rounded-panel px-3 text-xs transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'danger' &&
          'border border-edge text-negative hover:border-negative hover:bg-negative-muted',
        variant === 'default' &&
          'border border-edge text-content-secondary hover:border-edge-strong hover:text-content',
        props.className,
      )}
    />
  )
}

/** Fila de datos en modo solo lectura, para diagnóstico. */
export function ReadOnlyRow({
  label,
  value,
  mono = true,
}: {
  label: string
  value: string
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-edge pb-2 last:border-0 last:pb-0">
      <span className="shrink-0 text-xs text-content-muted">{label}</span>
      <span
        className={cn(
          'text-selectable truncate text-right text-xs text-content-secondary',
          mono && 'tabular',
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
