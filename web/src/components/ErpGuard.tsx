import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ErpGuard() {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />

  // Se for operador e não possuir nenhuma permissão do ERP, redireciona para a tela de OS/Checklist
  if (user?.role === 'operator') {
    const hasAnyErpPerm = user.permissions?.some(p => p !== 'os_orders' && p !== 'quotes')
    if (!hasAnyErpPerm) return <Navigate to="/" replace />
  }

  return <Outlet />
}

