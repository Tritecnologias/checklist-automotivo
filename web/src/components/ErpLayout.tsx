import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Tenant } from '../contexts/AuthContext'
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  Tag,
  Boxes,
  Receipt,
  CircleDollarSign,
  Users,
  Store,
  UserCheck,
  UploadCloud,
  Wrench,
  Shield,
  ClipboardList,
  LogOut,
  MapPin,
  ChevronDown,
  Check,
  type LucideIcon,
} from 'lucide-react'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  roles?: string[]
}

const nav: NavItem[] = [
  { to: '/erp',          label: 'Dashboard',   icon: LayoutDashboard, end: true },
  { to: '/erp/pdv',      label: 'PDV',         icon: ShoppingCart },
  { to: '/erp/caixa',    label: 'Caixa',       icon: Wallet },
  { to: '/erp/produtos', label: 'Produtos',    icon: Tag,             roles: ['owner', 'manager'] },
  { to: '/erp/estoque',  label: 'Estoque',     icon: Boxes,           roles: ['owner', 'manager'] },
  { to: '/erp/vendas',   label: 'Vendas',      icon: Receipt,         roles: ['owner', 'manager'] },
  { to: '/erp/contas',   label: 'Financeiro',  icon: CircleDollarSign,roles: ['owner', 'manager'] },
  { to: '/erp/clientes', label: 'Clientes',    icon: Users,           roles: ['owner', 'manager'] },
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
      <div className="px-3 py-2 rounded-xl bg-slate-800/60 mx-3 mb-2 border border-slate-700/40">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
          <Store className="w-3 h-3 text-slate-400" />
          <span>Loja</span>
        </div>
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
        className="w-full px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all text-left flex items-center justify-between group"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
            <Store className="w-3 h-3 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <span>Loja</span>
          </div>
          <p className="text-xs font-semibold text-white truncate">
            {current?.nome ?? 'Todas as lojas'}
          </p>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180 text-blue-400' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-700/50">
          {tenants.map(t => (
            <button
              key={t.id}
              onClick={() => { onSwitch(t); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 text-xs font-medium hover:bg-slate-700/80 transition-colors flex items-center justify-between ${
                t.id === current?.id ? 'text-blue-400 bg-blue-600/10 font-semibold' : 'text-slate-200'
              }`}
            >
              <span className="truncate">{t.nome}</span>
              {t.id === current?.id && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
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
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col">

        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-800 shrink-0 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold shrink-0">
            <span className="text-xs">4R</span>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest leading-none mb-1">Sistema</p>
            <p className="text-sm font-bold text-white tracking-tight leading-none">4Rodas ERP</p>
          </div>
        </div>

        {/* Usuário logado */}
        <div className="px-4 py-3 border-b border-slate-800 shrink-0">
          <p className="text-xs font-medium text-white truncate">{user?.nome}</p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[user?.role ?? 'operator']}`}>
            {ROLE_LABEL[user?.role ?? 'operator']}
          </span>
        </div>

        {/* Seletor de tenant */}
        <div className="py-2 border-b border-slate-800 shrink-0">
          <TenantSwitcher
            tenants={isOwner && tenants.length === 0
              ? []  // owner sem lojas cadastradas ainda
              : tenants
            }
            current={currentTenant}
            onSwitch={switchTenant}
          />
        </div>

        {/* Área de rolagem dos itens de navegação da sidebar */}
        <div className="flex-1 overflow-y-auto">
          <nav className="px-3 py-3 space-y-1">
            {visibleNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Gestão (owner only) */}
          {isOwner && (
            <div className="px-3 py-3 border-t border-slate-800/80 space-y-1">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-1.5">Gestão</p>
              <NavLink
                to="/erp/lojas"
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                  }`
                }
              >
                <Store className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                <span>Lojas</span>
              </NavLink>
              <NavLink
                to="/erp/usuarios"
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                  }`
                }
              >
                <UserCheck className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                <span>Usuários</span>
              </NavLink>
              <NavLink
                to="/erp/importar"
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                  }`
                }
              >
                <UploadCloud className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                <span>Importar</span>
              </NavLink>
              <NavLink
                to="/erp/config/instalacoes"
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                  }`
                }
              >
                <Wrench className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                <span>Instalações</span>
              </NavLink>
              <NavLink
                to="/erp/produtos"
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                  }`
                }
              >
                <Shield className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                <span>Admin</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-3 py-3 border-t border-slate-800/80 space-y-1 shrink-0">
          <a
            href="/"
            className="group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
          >
            <ClipboardList className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
            <span>Ordens de Serviço</span>
          </a>
          <button
            onClick={handleLogout}
            className="group w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        <header className="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-medium text-slate-300">
              {currentTenant ? currentTenant.nome : isOwner ? 'Todas as lojas' : ''}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
