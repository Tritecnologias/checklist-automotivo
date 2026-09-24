import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/orders', label: 'Ordens de Serviço', end: false },
  { to: '/erp', label: '🏪 ERP', end: false, roles: ['owner', 'manager', 'caixa'] },
  { to: '/erp/produtos', label: '⚙️ Admin', end: false, roles: ['owner', 'manager'] },
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
              <span>🔧</span> Checklist Automotivo
            </span>
            <nav className="flex items-center gap-1">
              {visibleNav.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`
                  }
                >
                  {label}
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
              <span>🚪</span> Sair
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
