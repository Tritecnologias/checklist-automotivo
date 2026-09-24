import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Tenant } from '../contexts/AuthContext'

type NavItem = { to: string; label: string; icon: string; end?: boolean; roles?: string[] }

const nav: NavItem[] = [
  { to: '/erp',           label: 'Dashboard',  icon: '📊', end: true },
  { to: '/erp/pdv',       label: 'PDV',         icon: '🛒' },
  { to: '/erp/caixa',     label: 'Caixa',       icon: '🏦' },
  { to: '/erp/produtos',  label: 'Produtos',    icon: '🏷️', roles: ['owner', 'manager'] },
  { to: '/erp/estoque',   label: 'Estoque',     icon: '📦', roles: ['owner', 'manager'] },
  { to: '/erp/vendas',    label: 'Vendas',      icon: '📋', roles: ['owner', 'manager'] },
  { to: '/erp/contas',    label: 'Financeiro',  icon: '💰', roles: ['owner', 'manager'] },
  { to: '/erp/clientes',  label: 'Clientes',    icon: '👥', roles: ['owner', 'manager'] },
]

const ROLE_LABEL: Record<string, string> = {
  owner:    'Proprietário',
  manager:  'Gerente',
  operator: 'Operador',
  caixa:    'Caixa',
}
const ROLE_COLOR: Record<string, string> = {
  owner:    'bg-amber-500/20 text-amber-300',
  manager:  'bg-blue-500/20 text-blue-300',
  operator: 'bg-slate-500/20 text-slate-300',
  caixa:    'bg-green-500/20 text-green-300',
}

function TenantSwitcher({ tenants, current, onSwitch }: {
  tenants: Tenant[]
  current: Tenant | null
  onSwitch: (t: Tenant) => void
}) {
  const [open, setOpen] = useState(false)

  if (tenants.length <= 1) {
    return (
      <div className="px-3 py-2 rounded-lg bg-slate-800/60 mx-3 mb-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Loja</p>
        <p className="text-xs font-semibold text-white truncate">
          {current?.nome ?? 'Todas as lojas'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative mx-3 mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition-colors text-left"
      >
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Loja ▾</p>
        <p className="text-xs font-semibold text-white truncate">
          {current?.nome ?? 'Todas as lojas'}
        </p>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {tenants.map(t => (
            <button
              key={t.id}
              onClick={() => { onSwitch(t); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center gap-2 ${
                t.id === current?.id ? 'text-blue-300 bg-blue-600/10' : 'text-slate-200'
              }`}
            >
              {t.id === current?.id && <span className="text-xs">✓</span>}
              <span className={t.id === current?.id ? '' : 'ml-4'}>{t.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ErpLayout() {
  const navigate = useNavigate()
  const { user, tenants, currentTenant, switchTenant, logout, isOwner } = useAuth()
  const visibleNav = nav.filter(item => !item.roles || item.roles.includes(user?.role ?? ''))

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">

        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Sistema</p>
          <p className="text-base font-bold text-white">4Rodas ERP</p>
        </div>

        {/* Usuário logado */}
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-xs font-medium text-white truncate">{user?.nome}</p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[user?.role ?? 'operator']}`}>
            {ROLE_LABEL[user?.role ?? 'operator']}
          </span>
        </div>

        {/* Seletor de tenant */}
        <div className="py-2 border-b border-slate-800">
          <TenantSwitcher
            tenants={isOwner && tenants.length === 0
              ? []  // owner sem lojas cadastradas ainda
              : tenants
            }
            current={currentTenant}
            onSwitch={switchTenant}
          />
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {visibleNav.map(({ to, label, icon, end }) => (
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

        {/* Gestão (owner only) */}
        {isOwner && (
          <div className="px-3 py-3 border-t border-slate-800 space-y-0.5">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest px-3 mb-1">Gestão</p>
            <NavLink
              to="/erp/lojas"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span className="text-base leading-none">🏪</span> Lojas
            </NavLink>
            <NavLink
              to="/erp/usuarios"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span className="text-base leading-none">👤</span> Usuários
            </NavLink>
            <NavLink
              to="/erp/importar"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span className="text-base leading-none">📥</span> Importar
            </NavLink>
            <NavLink
              to="/erp/config/instalacoes"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span className="text-base leading-none">🔩</span> Instalações
            </NavLink>
            <NavLink
              to="/erp/produtos"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <span className="text-base leading-none">⚙️</span> Admin
            </NavLink>
          </div>
        )}

        {/* Rodapé */}
        <div className="px-3 py-4 border-t border-slate-800 space-y-0.5">
          <a
            href="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <span>🔩</span> Ordens de Serviço
          </a>
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
        <header className="h-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
          <p className="text-xs text-slate-500">
            {currentTenant ? `📍 ${currentTenant.nome}` : isOwner ? '📍 Todas as lojas' : ''}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              🚪 Sair
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
