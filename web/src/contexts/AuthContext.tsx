import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { queryClient } from '../lib/queryClient'

export interface Tenant {
  id: number
  nome: string
  slug: string
}

export interface AuthUser {
  id: number
  nome: string
  email: string
  role: 'owner' | 'manager' | 'operator' | 'caixa' | 'mecanico' | string
  mecanico_id?: number | null
  mecanico_nome?: string | null
  permissions?: string[]
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  tenants: Tenant[]
  currentTenant: Tenant | null
  initialLoading: boolean
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser, tenants: Tenant[]) => void
  logout: () => void
  switchTenant: (tenant: Tenant) => void
  refreshUser: () => Promise<void>
  hasPermission: (perm: string) => boolean
  isOwner: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_TOKEN   = 'erp_jwt_token'
const STORAGE_USER    = 'erp_user'
const STORAGE_TENANTS = 'erp_tenants'
const STORAGE_TENANT  = 'erp_current_tenant'

const DEFAULT_ROLE_PERMS: Record<string, string[]> = {
  manager: [
    'dashboard', 'pdv', 'caixa', 'produtos', 'estoque', 'estoque_valorizacao',
    'estoque_curva_abc', 'estoque_sugestao_compras', 'estoque_kardex', 'oficina',
    'vendas', 'contas_receber', 'contas_pagar', 'dre', 'clientes', 'crm',
    'os_orders', 'quotes', 'relatorio_multi_lojas', 'importar', 'config_tipos', 'config_instalacoes'
  ],
  caixa: ['dashboard', 'pdv', 'caixa'],
  operator: ['os_orders', 'quotes'],
  mecanico: ['oficina', 'os_orders'],
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const token   = localStorage.getItem(STORAGE_TOKEN)
      const user    = JSON.parse(localStorage.getItem(STORAGE_USER)    ?? 'null')
      const tenants = JSON.parse(localStorage.getItem(STORAGE_TENANTS) ?? '[]')
      const tenant  = JSON.parse(localStorage.getItem(STORAGE_TENANT)  ?? 'null')
      return { token, user, tenants, currentTenant: tenant, initialLoading: !!token }
    } catch {
      return { token: null, user: null, tenants: [], currentTenant: null, initialLoading: false }
    }
  })

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    localStorage.removeItem(STORAGE_TENANTS)
    localStorage.removeItem(STORAGE_TENANT)
    // também limpa o antigo token de admin para forçar re-login
    localStorage.removeItem('admin_token')
    setState({ token: null, user: null, tenants: [], currentTenant: null, initialLoading: false })
    queryClient.clear()
  }, [])

  const login = useCallback((token: string, user: AuthUser, tenants: Tenant[]) => {
    // owner sem tenants específicos pode ver todos — escolhe a primeira loja disponível
    const defaultTenant = tenants[0] ?? null
    localStorage.setItem(STORAGE_TOKEN,   token)
    localStorage.setItem(STORAGE_USER,    JSON.stringify(user))
    localStorage.setItem(STORAGE_TENANTS, JSON.stringify(tenants))
    localStorage.setItem(STORAGE_TENANT,  JSON.stringify(defaultTenant))
    setState({ token, user, tenants, currentTenant: defaultTenant, initialLoading: false })
    queryClient.clear()
    queryClient.invalidateQueries()
  }, [])

  const switchTenant = useCallback((tenant: Tenant) => {
    localStorage.setItem(STORAGE_TENANT, JSON.stringify(tenant))
    setState(s => ({ ...s, currentTenant: tenant }))
    // Força refetch imediato de todas as consultas ativas para a nova loja via AJAX
    queryClient.clear()
    queryClient.invalidateQueries()
  }, [])

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_TOKEN)
    if (!token) {
      setState(s => ({ ...s, initialLoading: false }))
      return
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.token) {
          localStorage.setItem(STORAGE_TOKEN, data.token)
        }
        if (data.user) {
          localStorage.setItem(STORAGE_USER, JSON.stringify(data.user))
          if (data.tenants) {
            localStorage.setItem(STORAGE_TENANTS, JSON.stringify(data.tenants))
          }
          setState(s => ({
            ...s,
            token: data.token ?? s.token,
            user: data.user,
            tenants: data.tenants ?? s.tenants,
            initialLoading: false,
          }))
        }
      } else if (res.status === 401) {
        logout()
      } else {
        setState(s => ({ ...s, initialLoading: false }))
      }
    } catch (e) {
      console.error('Erro ao recarregar dados do usuário:', e)
      setState(s => ({ ...s, initialLoading: false }))
    }
  }, [logout])

  // Recarrega permissões atualizadas no mount da aplicação
  useEffect(() => {
    if (state.token) {
      refreshUser()
    }
  }, [refreshUser])

  // Recarrega permissões automaticamente quando o usuário volta para a aba do navegador
  useEffect(() => {
    function handleFocus() {
      if (localStorage.getItem(STORAGE_TOKEN)) {
        refreshUser()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshUser])

  const hasPermission = useCallback((perm: string): boolean => {
    if (!state.user) return false
    if (state.user.role === 'owner') return true
    if (state.user.permissions?.includes('*')) return true
    if (Array.isArray(state.user.permissions)) {
      return state.user.permissions.includes(perm)
    }
    // Fallback caso permissions ainda não tenha terminado de carregar
    const defaults = DEFAULT_ROLE_PERMS[state.user.role] ?? []
    return defaults.includes(perm)
  }, [state.user])

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      switchTenant,
      refreshUser,
      hasPermission,
      isOwner: state.user?.role === 'owner',
      isAuthenticated: !!state.token && !!state.user,
    }}>
      {children}
    </AuthContext.Provider>
  )

}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
