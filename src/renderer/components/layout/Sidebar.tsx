import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NAVIGATION } from '../../app/navigation'
import { useUiStore } from '../../stores/ui-store'
import { cn } from '../../lib/cn'

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggle = useUiStore((state) => state.toggleSidebar)

  return (
    <nav
      className={cn(
        'flex shrink-0 flex-col border-r border-edge bg-surface transition-[width] duration-160 ease-out',
        collapsed ? 'w-14' : 'w-56',
      )}
      aria-label={t('nav.dashboard')}
    >
      <ul className="flex flex-1 flex-col gap-1 p-2">
        {NAVIGATION.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.path}
              // `end` solo en la raíz: sin esto, el panel quedaría marcado como
              // activo en todas las rutas, porque "/" es prefijo de todas.
              end={item.path === '/'}
              title={collapsed ? t(`nav.${item.labelKey}`) : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-panel px-3 py-2 text-sm transition-colors duration-120',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-content-secondary hover:bg-elevated hover:text-content',
                )
              }
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{t(`nav.${item.labelKey}`)}</span>
                  {item.shortcut && (
                    <kbd className="shrink-0 text-[10px] tabular text-content-muted opacity-0 transition-opacity group-hover:opacity-100">
                      {item.shortcut}
                    </kbd>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        title={collapsed ? t('nav.expand') : t('nav.collapse')}
        className="flex items-center gap-3 border-t border-edge px-4 py-3 text-content-muted transition-colors duration-120 hover:bg-elevated hover:text-content"
      >
        {collapsed ? (
          <PanelLeftOpen className="size-4" aria-hidden />
        ) : (
          <PanelLeftClose className="size-4" aria-hidden />
        )}
        {!collapsed && <span className="text-xs">{t('nav.collapse')}</span>}
      </button>
    </nav>
  )
}
