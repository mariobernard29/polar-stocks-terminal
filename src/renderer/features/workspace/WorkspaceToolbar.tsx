import { useState } from 'react'
import { Copy, Plus, RotateCcw, Save, Star, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PANEL_REGISTRY } from '../../panels/registry'
import { cn } from '../../lib/cn'
import type { LayoutsController } from './use-layouts'

/**
 * Barra de acciones del espacio de trabajo.
 *
 * Deliberadamente sin diálogos modales del sistema: `window.prompt` está
 * bloqueado en Electron con sandbox, y un modal propio para nombrar una
 * disposición es más rápido de usar con teclado.
 */
export function WorkspaceToolbar({
  disabled,
  onAddPanel,
  onDuplicate,
  onClosePanel,
  onReset,
  serialize,
  restore,
  layouts,
}: {
  disabled: boolean
  onAddPanel: (type: string) => void
  onDuplicate: () => void
  onClosePanel: () => void
  onReset: () => void
  serialize: () => string | null
  restore: (state: string) => void
  layouts: LayoutsController
}): React.JSX.Element {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const handleSave = async (name: string): Promise<void> => {
    const state = serialize()
    if (!state) return
    await layouts.save(name, state)
    setNameDraft(null)
    setStatus(t('workspace.saved', { name }))
    setTimeout(() => setStatus(null), 2500)
  }

  const handleLoad = async (id: string): Promise<void> => {
    const record = await layouts.load(id)
    if (record) restore(record.state)
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-edge bg-surface px-3">
      <div className="relative">
        <ToolbarButton
          icon={Plus}
          label={t('workspace.addPanel')}
          disabled={disabled}
          onClick={() => setAddOpen((open) => !open)}
        />
        {addOpen && (
          <>
            {/* Capa invisible que cierra el menú al pulsar fuera. */}
            <div className="fixed inset-0 z-40" onClick={() => setAddOpen(false)} aria-hidden />
            <ul className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-panel border border-edge bg-overlay py-1 shadow-xl">
              {Object.values(PANEL_REGISTRY).map((definition) => (
                <li key={definition.type}>
                  <button
                    type="button"
                    onClick={() => {
                      onAddPanel(definition.type)
                      setAddOpen(false)
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-content-secondary transition-colors duration-120 hover:bg-elevated hover:text-content"
                  >
                    <definition.icon className="size-3.5" aria-hidden />
                    {t(`panels.${definition.titleKey}`)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ToolbarButton
        icon={Copy}
        label={t('workspace.duplicate')}
        disabled={disabled}
        onClick={onDuplicate}
      />
      <ToolbarButton
        icon={X}
        label={t('workspace.closePanel')}
        disabled={disabled}
        onClick={onClosePanel}
      />

      <div className="mx-1 h-5 w-px bg-edge" />

      <ToolbarButton
        icon={Save}
        label={t('workspace.saveLayout')}
        disabled={disabled}
        onClick={() => setNameDraft('')}
      />
      <ToolbarButton
        icon={RotateCcw}
        label={t('workspace.reset')}
        disabled={disabled}
        onClick={onReset}
      />

      {layouts.list.length > 0 && (
        <>
          <div className="mx-1 h-5 w-px bg-edge" />
          <div className="flex items-center gap-1 overflow-x-auto">
            {layouts.list.map((layout) => (
              <div
                key={layout.id}
                className="group flex shrink-0 items-center rounded border border-edge bg-elevated"
              >
                <button
                  type="button"
                  onClick={() => void handleLoad(layout.id)}
                  className="flex items-center gap-1.5 py-1 pl-2 pr-1 text-[11px] text-content-secondary transition-colors duration-120 hover:text-content"
                  title={t('workspace.loadLayout')}
                >
                  {layout.isDefault && <Star className="size-2.5 fill-accent text-accent" />}
                  {layout.name}
                </button>
                <button
                  type="button"
                  onClick={() => void layouts.setDefault(layout.id)}
                  title={t('workspace.makeDefault')}
                  className="px-1 py-1 text-content-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                >
                  <Star className="size-2.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void layouts.remove(layout.id)}
                  title={t('workspace.deleteLayout')}
                  className="px-1 py-1 pr-1.5 text-content-muted opacity-0 transition-opacity hover:text-negative group-hover:opacity-100"
                >
                  <Trash2 className="size-2.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex-1" />

      {status && <span className="text-[11px] text-positive">{status}</span>}

      {nameDraft !== null && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (nameDraft.trim()) void handleSave(nameDraft.trim())
          }}
          className="flex items-center gap-1"
        >
          <input
            autoFocus
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNameDraft(null)
            }}
            placeholder={t('workspace.layoutName')}
            maxLength={64}
            className="h-6 w-40 rounded border border-edge bg-elevated px-2 text-[11px] text-content outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded bg-accent px-2 py-1 text-[11px] text-white transition-opacity hover:opacity-90"
          >
            {t('common.save')}
          </button>
        </form>
      )}
    </div>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'flex size-7 items-center justify-center rounded text-content-muted transition-colors duration-120',
        'hover:bg-elevated hover:text-content',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
}
