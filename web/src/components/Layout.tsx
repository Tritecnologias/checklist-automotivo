import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, ClipboardList, Store, Shield, LogOut, Wrench, type LucideIcon } from 'lucide-react'

const nav: { to: string; label: string; icon: LucideIcon; end?: boolean; roles?: string[] }[] = [
  { to: '/',             label: 'Dashboard',         icon: LayoutDashboard, end: true },
  { to: '/orders',       label: 'Ordens de Serviço', icon: ClipboardList,   end: false },
  { to: '/erp',          label: 'ERP',               icon: Store,           end: false, roles: ['owner', 'manager', 'caixa'] },
  { to: '/erp/produtos', label: 'Admin',             icon: Shield,          end: false, roles: ['owner', 'manager'] },
]

export default function Layout() {
  const navigate = useNavigate()
  const { user, currentTenant, logout } = useAuth()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const visibleNav = nav.filter(item => !item.roles || item.roles.includes(user?.role ?? ''))

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <span className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Wrench className="w-4 h-4" />
              </div>
              <span>Checklist Automotivo</span>
            </span>
            <nav className="flex items-center gap-1.5">
              {visibleNav.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* User info & Logout */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-white leading-tight">{user.nome}</span>
                {currentTenant && (
                  <span className="text-[10px] text-slate-400 leading-tight">{currentTenant.nome}</span>
                )}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              title="Sair do sistema"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
