import type {
  AddItemPayload,
  CatalogItem,
  Order,
  OrderItem,
  PinVerificationResult,
  Vehicle,
} from '@/types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Ordens ──────────────────────────────────────────────────────────────────

export const api = {
  /** Cria uma nova OS a partir dos dados do veículo */
  createOrder: (vehicle: Vehicle) =>
    request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        vehicle,
        status: 'open',
        items: [],
        totalAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    }),

  /** GET /orders — lista todas as OS ordenadas por data */
  listOrders: () => request<Order[]>('/orders'),

  /** Busca uma OS pelo ID (usado pelo useQuery da tela de comanda) */
  getOrder: (id: string) => request<Order>(`/orders/${id}`),

  /** PATCH /orders/:id/status — atualiza status (open/in_progress/closed) */
  updateOrderStatus: (id: string, status: string) =>
    request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // ─── Catálogo ──────────────────────────────────────────────────────────────

  searchCatalog: (search: string) =>
    request<CatalogItem[]>(`/items?search=${encodeURIComponent(search)}`),

  // ─── Itens da Ordem ────────────────────────────────────────────────────────

  /** POST /orders/:id/items — dispara atualização no backend via WS */
  addItem: (orderId: string, payload: AddItemPayload) =>
    request<OrderItem>(`/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** PATCH /orders/:id/items/:itemId — requer PIN se reduzir */
  updateItemQuantity: (orderId: string, itemId: string, quantity: number) =>
    request<OrderItem>(`/orders/${orderId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),

  /** DELETE /orders/:id/items/:itemId — sempre requer PIN */
  removeItem: (orderId: string, itemId: string) =>
    request<void>(`/orders/${orderId}/items/${itemId}`, { method: 'DELETE' }),

  /** PATCH /orders/:id/items/:itemId/labor — define MO do item */
  updateItemLabor: (orderId: string, itemId: string, laborPrice: number) =>
    request<Order>(`/orders/${orderId}/items/${itemId}/labor`, {
      method: 'PATCH',
      body: JSON.stringify({ laborPrice }),
    }),

  // ─── Autenticação ──────────────────────────────────────────────────────────

  /** POST /auth/verify-supervisor-pin — retorna { authorized, supervisorName } */
  verifySupervisorPin: (pin: string) =>
    request<PinVerificationResult>('/auth/verify-supervisor-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
};
