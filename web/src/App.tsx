import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout       from './components/Layout'
import AdminLayout  from './components/AdminLayout'
import AuthGuard    from './components/AuthGuard'
import ErpLayout    from './components/ErpLayout'
import Login        from './pages/Login'
import AdminLogin   from './pages/AdminLogin'
import Dashboard    from './pages/Dashboard'
import Orders       from './pages/Orders'
import OrderDetail  from './pages/OrderDetail'
import AdminProducts   from './pages/AdminProducts'
import AdminClients    from './pages/AdminClients'
import ErpDashboard    from './pages/ErpDashboard'
import Caixa           from './pages/Caixa'
import Pdv             from './pages/Pdv'
import Vendas          from './pages/Vendas'
import Contas          from './pages/Contas'
import Estoque         from './pages/Estoque'
import Clientes        from './pages/Clientes'
import ClienteHistorico from './pages/ClienteHistorico'
import Lojas           from './pages/Lojas'
import Usuarios        from './pages/Usuarios'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Login principal (JWT) */}
          <Route path="/login" element={<Login />} />

          {/* Login legado de admin (mantido por compatibilidade) */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* ERP + Admin — exige JWT */}
          <Route element={<AuthGuard />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin/products" element={<AdminProducts />} />
              <Route path="/admin/clients"  element={<AdminClients />} />
              <Route path="/admin" element={<Navigate to="/admin/products" replace />} />
            </Route>

            <Route element={<ErpLayout />}>
              <Route path="/erp"              element={<ErpDashboard />} />
              <Route path="/erp/pdv"          element={<Pdv />} />
              <Route path="/erp/vendas"       element={<Vendas />} />
              <Route path="/erp/contas"       element={<Contas />} />
              <Route path="/erp/estoque"      element={<Estoque />} />
              <Route path="/erp/caixa"        element={<Caixa />} />
              <Route path="/erp/clientes"     element={<Clientes />} />
              <Route path="/erp/clientes/:id" element={<ClienteHistorico />} />
              <Route path="/erp/lojas"        element={<Lojas />} />
              <Route path="/erp/usuarios"     element={<Usuarios />} />
            </Route>
          </Route>

          {/* App principal (OS/Checklist) — público */}
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="orders"     element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
