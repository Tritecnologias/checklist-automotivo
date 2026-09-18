import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const nav = [
  { to: '/admin/products', label: '📦 Produtos' },
  { to: '/admin/clients',  label: '👥 Clientes'  },
]

export default function AdminLayout() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('admin_token')
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-14">
          <span className="text-base font-bold text-white tracking-tight">⚙️ Admin 4Rodas</span>
          <nav className="flex items-center gap-1 flex-1">
            {nav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
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
          <div className="flex items-center gap-4">
            <NavLink to="/" className="text-sm text-slate-400 hover:text-white transition-colors">
              ← Dashboard
            </NavLink>
            <button
              onClick={handleLogout}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Sair
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
