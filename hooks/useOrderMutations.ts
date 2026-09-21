import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AddItemPayload, Order } from '@/types';

// ─── Adicionar item ───────────────────────────────────────────────────────────

export function useAddItem(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddItemPayload) => api.addItem(orderId, payload),
    onSuccess: () => {
      // Invalida para re-fetch com os dados oficiais do backend
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });
}

// ─── Remover item (requer PIN já validado externamente) ───────────────────────

export function useRemoveItem(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.removeItem(orderId, itemId),
    // Optimistic update: remove o item localmente antes da resposta
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: ['order', orderId] });
      const snapshot = qc.getQueryData<Order>(['order', orderId]);
      qc.setQueryData<Order>(['order', orderId], (prev) =>
        prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : prev,
      );
      return { snapshot };
    },
    onError: (_err, _itemId, ctx) => {
      // Reverte em caso de falha
      if (ctx?.snapshot) {
        qc.setQueryData(['order', orderId], ctx.snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });
}

// ─── Atualizar quantidade (requer PIN se estiver reduzindo) ───────────────────

export function useUpdateQuantity(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      api.updateItemQuantity(orderId, itemId, quantity),
    onMutate: async ({ itemId, quantity }) => {
      await qc.cancelQueries({ queryKey: ['order', orderId] });
      const snapshot = qc.getQueryData<Order>(['order', orderId]);
      qc.setQueryData<Order>(['order', orderId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === itemId
              ? { ...i, quantity, total: quantity * i.unitPrice }
              : i,
          ),
        };
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(['order', orderId], ctx.snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });
}

// ─── Atualizar MO de um item ──────────────────────────────────────────────────

export function useUpdateItemLabor(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, laborPrice }: { itemId: string; laborPrice: number }) =>
      api.updateItemLabor(orderId, itemId, laborPrice),
    onMutate: async ({ itemId, laborPrice }) => {
      await qc.cancelQueries({ queryKey: ['order', orderId] });
      const snapshot = qc.getQueryData<Order>(['order', orderId]);
      qc.setQueryData<Order>(['order', orderId], (prev) => {
        if (!prev) return prev;
        const newItems = prev.items.map((i) =>
          i.id === itemId ? { ...i, laborPrice } : i,
        );
        const totalLabor = newItems.reduce((s, i) => s + (i.laborPrice ?? 0), 0);
        const totalParts = newItems.reduce((s, i) => s + (i.total ?? 0), 0);
        return {
          ...prev,
          items: newItems,
          laborAmount: totalLabor,
          totalAmount: totalParts + totalLabor,
        };
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(['order', orderId], ctx.snapshot);
    },
    onSuccess: (updated: Order) => {
      qc.setQueryData(['order', orderId], updated);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });
}

// ─── Verificar PIN de supervisor ──────────────────────────────────────────────

export function useVerifyPin() {
  return useMutation({
    mutationFn: (pin: string) => api.verifySupervisorPin(pin),
    // Sem cache — cada verificação deve bater na API
    gcTime: 0,
  });
}
