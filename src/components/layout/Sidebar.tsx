import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowDownUp, Upload, Tag, Lightbulb, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transações', icon: ArrowDownUp },
  { to: '/import', label: 'Importar', icon: Upload },
  { to: '/categories', label: 'Categorias', icon: Tag },
  { to: '/suggestions', label: 'Sugestões', icon: Lightbulb },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r bg-sidebar flex flex-col h-full">
      <div className="px-4 py-5 border-b">
        <h1 className="text-sm font-semibold text-sidebar-foreground">Finanças Pessoais</h1>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
