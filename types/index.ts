// ─── Veículo ────────────────────────────────────────────────────────────────

export interface Vehicle {
  plate: string;
  model: string;
  mileage: number;
}

// ─── Ordem de Serviço ────────────────────────────────────────────────────────

export type OrderStatus = 'open' | 'in_progress' | 'closed';

export interface Order {
  id: string;
  tenantId: number;
  vehicle: Vehicle;
  items: OrderItem[];
  status: OrderStatus;
  laborAmount: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

// ─── Itens da Ordem ──────────────────────────────────────────────────────────

export type ItemType = 'part' | 'service';

export interface OrderItem {
  id: string;
  code: string;
  description: string;
  type: ItemType;
  quantity: number;
  unitPrice: number;
  laborPrice: number;
  total: number;
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  code: string;
  description: string;
  type: ItemType;
  unitPrice: number;
  stock?: number;
}

// ─── Mutações ────────────────────────────────────────────────────────────────

export interface AddItemPayload {
  catalogItemId: string;
  quantity: number;
  unitPrice?: number;
  laborPrice?: number;
}

export interface UpdateQuantityPayload {
  itemId: string;
  quantity: number;
}

// ─── PIN / Supervisor ────────────────────────────────────────────────────────

export interface PinVerificationResult {
  authorized: boolean;
  supervisorName?: string;
}

// Ação pendente que aguarda aprovação de PIN
export interface PendingAction {
  type: 'delete' | 'reduce' | 'close' | 'reopen';
  itemId: string;
  /** Mensagem completa exibida no modal, ex: "Excluir: FILTRO DE AR" */
  itemDescription: string;
  targetQuantity?: number;
}
