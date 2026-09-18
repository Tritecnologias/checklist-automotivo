import type { Order } from '../types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listOrders: () => request<Order[]>('/orders'),
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  updateOrderStatus: (id: string, status: string) =>
    request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
}

function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token') ?? ''
  return request<T>(path, {
    ...options,
    headers: { 'x-admin-token': token, ...options?.headers },
  })
}

export const adminApi = {
  listProducts: (search: string, page: number) =>
    adminRequest<{ data: unknown[]; total: number; pages: number }>(
      `/admin/products?search=${encodeURIComponent(search)}&page=${page}`
    ),
  updateProduct: (id: number, data: unknown) =>
    adminRequest(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createProduct: (data: unknown) =>
    adminRequest(`/admin/products`, { method: 'POST', body: JSON.stringify(data) }),
  toggleProduct: (id: number) =>
    adminRequest(`/admin/products/${id}/toggle`, { method: 'PATCH' }),

  listClients: (search: string, page: number) =>
    adminRequest<{ data: unknown[]; total: number; pages: number }>(
      `/admin/clients?search=${encodeURIComponent(search)}&page=${page}`
    ),
  updateClient: (id: number, data: unknown) =>
    adminRequest(`/admin/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createClient: (data: unknown) =>
    adminRequest(`/admin/clients`, { method: 'POST', body: JSON.stringify(data) }),
  toggleClient: (id: number) =>
    adminRequest(`/admin/clients/${id}/toggle`, { method: 'PATCH' }),
}
