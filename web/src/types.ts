export interface Vehicle {
  plate: string
  model: string
  mileage: number
}

export interface OrderItem {
  id: string
  code: string
  description: string
  type: 'part' | 'service'
  quantity: number
  unitPrice: number
  total: number
}

export interface Order {
  id: string
  vehicle: Vehicle
  status: 'open' | 'in_progress' | 'closed'
  items: OrderItem[]
  laborAmount: number
  totalAmount: number
  createdAt: string
  updatedAt: string
}
