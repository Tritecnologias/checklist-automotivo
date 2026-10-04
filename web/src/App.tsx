import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout       from './components/Layout'
import AdminLayout  from './components/AdminLayout'
import AuthGuard    from './components/AuthGuard'
import ErpGuard     from './components/ErpGuard'
import ErpLayout    from './components/ErpLayout'
import Login        from './pages/Login'
import AdminLogin   from './pages/AdminLogin'
import Dashboard    from './pages/Dashboard'
import Orders       from './pages/Orders'
import OrderDetail  from './pages/OrderDetail'
import Quotes       from './pages/Quotes'
import AdminProducts   from './pages/AdminProducts'
import AdminClients    from './pages/AdminClients'
import ErpDashboard    from './pages/ErpDashboard'
import Caixa           from './pages/Caixa'
import Pdv             from './pages/Pdv'
import Vendas          from './pages/Vendas'
import Contas          from './pages/Contas'
import ContasPagar     from './pages/ContasPagar'
import Estoque         from './pages/Estoque'
import Clientes        from './pages/Clientes'
import ClienteHistorico from './pages/ClienteHistorico'
import Lojas             from './pages/Lojas'
import Usuarios          from './pages/Usuarios'
import ImportarEstoque   from './pages/ImportarEstoque'
import ConfigInstalacoes from './pages/ConfigInstalacoes'
import ConfigTiposProdutos from './pages/ConfigTiposProdutos'
import ConfigParametros from './pages/ConfigParametros'
import RelatorioMultiLojas from './pages/RelatorioMultiLojas'
import CrmManutencoes from './pages/CrmManutencoes'
import CurvaAbc from './pages/CurvaAbc'
import ValorizacaoEstoque from './pages/ValorizacaoEstoque'
import OficinaProdutividade from './pages/OficinaProdutividade'
import DreGerencial from './pages/DreGerencial'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Login principal (JWT) */}
          <Route path="/login" element={<Login />} />

          {/* Login legado de admin (mantido por compatibilidade) */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* ERP + Admin — exige JWT e role != operator */}
          <Route element={<ErpGuard />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin/products" element={<Navigate to="/erp/produtos" replace />} />
              <Route path="/admin/clients"  element={<AdminClients />} />
              <Route path="/admin" element={<Navigate to="/erp/produtos" replace />} />
            </Route>

            <Route element={<ErpLayout />}>
              <Route path="/erp"              element={<ErpDashboard />} />
              <Route path="/erp/pdv"          element={<Pdv />} />
              <Route path="/erp/produtos"     element={<AdminProducts />} />
              <Route path="/erp/estoque"      element={<Estoque />} />
              <Route path="/erp/estoque/valorizacao" element={<ValorizacaoEstoque />} />
              <Route path="/erp/valorizacao"  element={<Navigate to="/erp/estoque/valorizacao" replace />} />
              <Route path="/erp/estoque/curva-abc" element={<CurvaAbc />} />
              <Route path="/erp/curva-abc"    element={<Navigate to="/erp/estoque/curva-abc" replace />} />
              <Route path="/erp/oficina"      element={<OficinaProdutividade />} />
              <Route path="/erp/produtividade" element={<Navigate to="/erp/oficina" replace />} />
              <Route path="/erp/caixa"        element={<Caixa />} />
              <Route path="/erp/vendas"       element={<Vendas />} />
              <Route path="/erp/contas"       element={<Contas />} />
              <Route path="/erp/contas-pagar" element={<ContasPagar />} />
              <Route path="/erp/dre"          element={<DreGerencial />} />
              <Route path="/erp/clientes"     element={<Clientes />} />
              <Route path="/erp/clientes/:id" element={<ClienteHistorico />} />
              <Route path="/erp/crm"          element={<CrmManutencoes />} />
              <Route path="/erp/crm/manutencoes" element={<CrmManutencoes />} />
              <Route path="/erp/lojas"        element={<Lojas />} />
              <Route path="/erp/usuarios"     element={<Usuarios />} />
              <Route path="/erp/importar"           element={<ImportarEstoque />} />
              <Route path="/erp/config/instalacoes" element={<ConfigInstalacoes />} />
              <Route path="/erp/config/tipos"       element={<ConfigTiposProdutos />} />
              <Route path="/erp/config/parametros"  element={<ConfigParametros />} />
              <Route path="/erp/relatorios/multi-lojas" element={<RelatorioMultiLojas />} />
              <Route path="/erp/tipos-produtos"     element={<Navigate to="/erp/config/tipos" replace />} />
            </Route>
          </Route>

          {/* App principal (OS/Checklist) — exige JWT (multi-tenant) */}
          <Route element={<AuthGuard />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="orders"     element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="quotes"     element={<Quotes />} />
              <Route path="orcamentos" element={<Navigate to="/quotes" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
