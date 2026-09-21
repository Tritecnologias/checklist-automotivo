import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const nav = [
  { to: '/erp',           label: 'Dashboard',  icon: '📊', end: true },
  { to: '/erp/pdv',       label: 'PDV',         icon: '🛒' },
  { to: '/erp/vendas',    label: 'Vendas',      icon: '📋' },
  { to: '/erp/contas',    label: 'Financeiro',  icon: '💰' },
  { to: '/erp/estoque',   label: 'Estoque',     icon: '📦' },
  { to: '/admin/clients', label: 'Clientes',    icon: '👥' },
  { to: '/admin/products',label: 'Produtos',    icon: '🔧' },
  { to: '/',              label: 'OS',          icon: '🔩' },
]

export default function ErpLayout() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('admin_token')
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Sistema</p>
          <p className="text-base font-bold text-white">4Rodas ERP</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
          >
            <span>🚪</span> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
