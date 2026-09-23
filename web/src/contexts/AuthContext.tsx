import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export interface Tenant {
  id: number
  nome: string
  slug: string
}

export interface AuthUser {
  id: number
  nome: string
  email: string
  role: 'owner' | 'manager' | 'operator'
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  tenants: Tenant[]
  currentTenant: Tenant | null
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser, tenants: Tenant[]) => void
  logout: () => void
  switchTenant: (tenant: Tenant) => void
  isOwner: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_TOKEN   = 'erp_jwt_token'
const STORAGE_USER    = 'erp_user'
const STORAGE_TENANTS = 'erp_tenants'
const STORAGE_TENANT  = 'erp_current_tenant'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const token   = localStorage.getItem(STORAGE_TOKEN)
      const user    = JSON.parse(localStorage.getItem(STORAGE_USER)    ?? 'null')
      const tenants = JSON.parse(localStorage.getItem(STORAGE_TENANTS) ?? '[]')
      const tenant  = JSON.parse(localStorage.getItem(STORAGE_TENANT)  ?? 'null')
      return { token, user, tenants, currentTenant: tenant }
    } catch {
      return { token: null, user: null, tenants: [], currentTenant: null }
    }
  })

  const login = useCallback((token: string, user: AuthUser, tenants: Tenant[]) => {
    // owner sem tenants específicos pode ver todos — escolhe a primeira loja disponível
    const defaultTenant = tenants[0] ?? null
    localStorage.setItem(STORAGE_TOKEN,   token)
    localStorage.setItem(STORAGE_USER,    JSON.stringify(user))
    localStorage.setItem(STORAGE_TENANTS, JSON.stringify(tenants))
    localStorage.setItem(STORAGE_TENANT,  JSON.stringify(defaultTenant))
    setState({ token, user, tenants, currentTenant: defaultTenant })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USER)
    localStorage.removeItem(STORAGE_TENANTS)
    localStorage.removeItem(STORAGE_TENANT)
    // também limpa o antigo token de admin para forçar re-login
    localStorage.removeItem('admin_token')
    setState({ token: null, user: null, tenants: [], currentTenant: null })
  }, [])

  const switchTenant = useCallback((tenant: Tenant) => {
    localStorage.setItem(STORAGE_TENANT, JSON.stringify(tenant))
    setState(s => ({ ...s, currentTenant: tenant }))
  }, [])

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      switchTenant,
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
