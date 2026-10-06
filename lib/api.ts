import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AddItemPayload,
  CatalogItem,
  Mecanico,
  Order,
  OrderClient,
  OrderItem,
  PinVerificationResult,
  Vehicle,
} from '@/types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://4rodas.tritecnologias.com.br/api';

export const AUTH_TOKEN_KEY = '@auth_token';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY).catch(() => null);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResult {
  token: string;
  user: {
    id: number;
    nome: string;
    email: string;
    role: string;
    mecanicoId?: number | null;
    mecanicoNome?: string | null;
  };
  tenants: { id: number; nome: string; slug: string }[];
}

async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const authApi = {
  login: (email: string, password: string) =>
    authRequest<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: LoginResult['user']; tenants: LoginResult['tenants'] }>('/auth/me'),

  selectTenant: (tenantId: number) =>
    request<{ token: string }>('/auth/select-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),
};

// ─── Ordens ──────────────────────────────────────────────────────────────────

export const api = {
  lookupPlate: (plate: string) =>
    request<{
      found: boolean;
      vehicle?: Vehicle;
      client?: OrderClient;
      source?: string;
    }>(`/orders/lookup-plate/${encodeURIComponent(plate)}`),

  listMecanicos: (apenasAtivos: boolean = true) =>
    request<Mecanico[]>(`/erp/mecanicos${apenasAtivos ? '?ativo=1' : ''}`),

  createOrder: (
    vehicle: Vehicle,
    status: 'quote' | 'open' = 'open',
    client?: OrderClient,
    mecanicoId?: number | null,
    auxiliarId?: number | null,
  ) =>
    request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify({ vehicle, status, client, mecanicoId, auxiliarId }),
    }),

  updateOrderClient: (id: string, client: { name: string; phone: string; document?: string; cep?: string; address?: string }) =>
    request<Order>(`/orders/${id}/client`, {
      method: 'PATCH',
      body: JSON.stringify(client),
    }),

  approveQuote: (id: string) =>
    request<Order>(`/orders/${id}/approve`, {
      method: 'POST',
    }),

  listOrders: (search?: string, status?: string, mecanicoId?: string | number) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status && status !== 'all') params.append('status', status);
    if (mecanicoId !== undefined && mecanicoId !== null && mecanicoId !== '') {
      params.append('mecanico_id', String(mecanicoId));
    }
    const qs = params.toString();
    return request<Order[]>(qs ? `/orders?${qs}` : '/orders');
  },

  updateOrderMechanic: (id: string, mecanicoId: number | null, aplicarAosItens: boolean = true) =>
    request<Order>(`/orders/${id}/mecanico`, {
      method: 'PATCH',
      body: JSON.stringify({ mecanicoId, aplicarAosItens }),
    }),

  getOrder: (id: string) => request<Order>(`/orders/${id}`),

  updateOrderStatus: (
    id: string,
    status: string,
    options?: { supervisorPin?: string; adminPassword?: string; isBalcao?: boolean }
  ) =>
    request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...options }),
    }),

  // ─── Catálogo ──────────────────────────────────────────────────────────────

  searchCatalog: (search: string) =>
    request<CatalogItem[]>(`/items?search=${encodeURIComponent(search)}`),

  // ─── Itens da Ordem ────────────────────────────────────────────────────────

  addItem: (orderId: string, payload: AddItemPayload) =>
    request<OrderItem>(`/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateItemQuantity: (orderId: string, itemId: string, quantity: number) =>
    request<OrderItem>(`/orders/${orderId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),

  removeItem: (orderId: string, itemId: string) =>
    request<void>(`/orders/${orderId}/items/${itemId}`, { method: 'DELETE' }),

  updateItemLabor: (orderId: string, itemId: string, laborPrice: number) =>
    request<Order>(`/orders/${orderId}/items/${itemId}/labor`, {
      method: 'PATCH',
      body: JSON.stringify({ laborPrice }),
    }),

  // ─── Autenticação (PIN de supervisor) ─────────────────────────────────────

  verifySupervisorPin: (pin: string) =>
    request<PinVerificationResult>('/auth/verify-supervisor-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
};
