import { useState } from 'react'
import {
  Database,
  Info,
  Keyboard,
  KeyRound,
  Languages,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  type LucideIcon,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { AboutSection } from './sections/AboutSection'
import { AiSection } from './sections/AiSection'
import { ApisSection } from './sections/ApisSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { DatabaseSection } from './sections/DatabaseSection'
import { GeneralSection } from './sections/GeneralSection'
import { LanguageSection } from './sections/LanguageSection'
import { ShortcutsSection } from './sections/ShortcutsSection'
import { UpdatesSection } from './sections/UpdatesSection'

/**
 * Configuración: las ocho secciones pedidas.
 *
 * Cada sección vive en su propio archivo. Una pantalla de configuración crece
 * sin parar —cada función nueva trae sus preferencias—, y un único archivo con
 * todo dentro se vuelve inmanejable en pocos meses.
 */
interface SettingsTab {
  readonly id: string
  readonly labelKey: string
  readonly icon: LucideIcon
  readonly Component: () => React.JSX.Element
}

const TABS: readonly SettingsTab[] = [
  { id: 'general', labelKey: 'general', icon: SlidersHorizontal, Component: GeneralSection },
  { id: 'appearance', labelKey: 'appearance', icon: Palette, Component: AppearanceSection },
  { id: 'shortcuts', labelKey: 'shortcuts', icon: Keyboard, Component: ShortcutsSection },
  { id: 'language', labelKey: 'language', icon: Languages, Component: LanguageSection },
  { id: 'apis', labelKey: 'apis', icon: KeyRound, Component: ApisSection },
  { id: 'ai', labelKey: 'ai', icon: Sparkles, Component: AiSection },
  { id: 'database', labelKey: 'database', icon: Database, Component: DatabaseSection },
  { id: 'updates', labelKey: 'updates', icon: RefreshCw, Component: UpdatesSection },
  { id: 'about', labelKey: 'about', icon: Info, Component: AboutSection },
]

export function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState(TABS[0]?.id ?? 'general')

  const active = TABS.find((tab) => tab.id === activeId) ?? TABS[0]
  if (!active) return <div />

  return (
    <div className="flex h-full">
      <nav
        className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-edge bg-surface p-3"
        aria-label={t('pages.settings.title')}
      >
        <h1 className="px-3 pt-1 pb-3 text-sm font-medium text-content">
          {t('pages.settings.title')}
        </h1>

        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveId(tab.id)}
            aria-current={tab.id === activeId ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-panel px-3 py-2 text-left text-sm transition-colors duration-120',
              tab.id === activeId
                ? 'bg-accent-muted text-accent'
                : 'text-content-secondary hover:bg-elevated hover:text-content',
            )}
          >
            <tab.icon className="size-4 shrink-0" aria-hidden />
            {t(`settings.${tab.labelKey}.title`)}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
          <active.Component />
        </div>
      </div>
    </div>
  )
}
