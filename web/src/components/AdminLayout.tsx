import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Boxes, Users, Store, Shield, LogOut, LayoutDashboard, type LucideIcon } from 'lucide-react'

const nav: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/admin/products', label: 'Produtos', icon: Boxes },
  { to: '/admin/clients',  label: 'Clientes', icon: Users },
  { to: '/erp',            label: 'ERP',      icon: Store },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-14">
          <div className="flex items-center gap-2 text-white font-bold tracking-tight">
            <Shield className="w-5 h-5 text-blue-500" />
            <span>Admin 4Rodas</span>
          </div>
          <nav className="flex items-center gap-1.5 flex-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
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
          <div className="flex items-center gap-4">
            {user && <span className="text-xs text-slate-400">{user.nome}</span>}
            <NavLink to="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </NavLink>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
