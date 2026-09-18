import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import AdminGuard from './components/AdminGuard'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import AdminLogin from './pages/AdminLogin'
import AdminProducts from './pages/AdminProducts'
import AdminClients from './pages/AdminClients'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin login (no auth required) */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Admin panel (auth required) */}
        <Route element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/products" element={<AdminProducts />} />
            <Route path="/admin/clients" element={<AdminClients />} />
            <Route path="/admin" element={<Navigate to="/admin/products" replace />} />
          </Route>
        </Route>

        {/* Main app */}
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
