import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ErpGuard() {
  const { isAuthenticated, user, initialLoading } = useAuth()
  if (!isAuthenticated && !initialLoading) return <Navigate to="/login" replace />

  // Se ainda estiver carregando a validação inicial do usuário e permissões via /auth/me, aguarda
  if (initialLoading && !user) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Carregando permissões…</p>
        </div>
      </div>
    )
  }

  // Se for owner, manager ou caixa, acesso ao ERP liberado
  if (user?.role === 'owner' || user?.role === 'manager' || user?.role === 'caixa') {
    return <Outlet />
  }

  // Para outros perfis (operator, mecanico, etc.): verifica se possui alguma permissão do ERP
  const hasAnyErpPerm = user?.permissions?.some(p => p !== 'os_orders' && p !== 'quotes')
  if (!hasAnyErpPerm) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

