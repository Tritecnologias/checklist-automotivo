import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { SearchBar } from '@/components/SearchBar';
import { SearchResultItem } from '@/components/SearchResultItem';
import { ItemRow } from '@/components/ItemRow';
import { PinModal } from '@/components/PinModal';
import { ServicePriceModal } from '@/components/ServicePriceModal';
import { InstalacaoModal } from '@/components/InstalacaoModal';
import { ClientEditModal } from '@/components/ClientEditModal';
import { MecanicoSelectorModal } from '@/components/MecanicoSelectorModal';
import {
  useAddItem,
  useRemoveItem,
  useUpdateItemLabor,
  useUpdateQuantity,
} from '@/hooks/useOrderMutations';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import type { CatalogItem, Mecanico, Order, OrderItem, PendingAction } from '@/types';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const scrollViewRef = useRef<ScrollView>(null);
  const searchCardY = useRef<number>(0);

  const [search, setSearch] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [instalacaoTarget, setInstalacaoTarget] = useState<CatalogItem | null>(null);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingLaborItem, setEditingLaborItem] = useState<OrderItem | null>(null);
  const [mecanicoModalTarget, setMecanicoModalTarget] = useState<
    | { type: 'titular'; selectedId: number | null }
    | { type: 'auxiliar'; selectedId: number | null }
    | { type: 'item'; item: OrderItem; selectedId: number | null }
    | null
  >(null);

  const [priceModalTarget, setPriceModalTarget] = useState<
    | { mode: 'catalog'; item: CatalogItem; instalacaoId?: number }
    | { mode: 'orderItem'; item: OrderItem }
    | null
  >(null);

  const debouncedSearch = useDebounce(search, 350);

  // ─── Queries ─────────────────────────────────────────────────────────────────

  const {
    data: order,
    isLoading: orderLoading,
    isError: orderError,
  } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.getOrder(id),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const { data: mecanicos = [] } = useQuery({
    queryKey: ['mecanicos'],
    queryFn: () => api.listMecanicos(true),
  });

  const {
    data: searchResults,
    isFetching: searching,
  } = useQuery({
    queryKey: ['catalog', debouncedSearch],
    queryFn: () => api.searchCatalog(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
    placeholderData: (prev) => prev ?? [],
  });

  // ─── Flag de OS encerrada ─────────────────────────────────────────────────────
  const isClosed = order?.status === 'closed';
  const isQuote = order?.status === 'quote';

  // ─── Mutações ─────────────────────────────────────────────────────────────────

  const { mutate: addItem, isPending: adding } = useAddItem(id);
  const { mutate: removeItem } = useRemoveItem(id);
  const { mutate: updateQty } = useUpdateQuantity(id);
  const { mutate: updateItemLabor } = useUpdateItemLabor(id);

  const { mutate: updateClient, isPending: savingClient } = useMutation({
    mutationFn: (clientData: {
      name: string;
      phone: string;
      document?: string;
      cep?: string;
      address?: string;
    }) => api.updateOrderClient(id, clientData),
    onSuccess: (updated: Order) => {
      qc.setQueryData(['order', id], updated);
      qc.invalidateQueries({ queryKey: ['orders'] });
      setClientModalOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro ao atualizar cliente', err?.message || 'Não foi possível salvar os dados do cliente.');
    },
  });

  const { mutate: updateMechanic } = useMutation({
    mutationFn: (mecanicoId: number | null) =>
      api.updateOrderMechanic(id, mecanicoId, true),
    onSuccess: (updated: Order) => {
      qc.setQueryData(['order', id], updated);
      qc.invalidateQueries({ queryKey: ['orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', err?.message || 'Não foi possível atualizar o mecânico titular.');
    },
  });

  const { mutate: updateAuxiliar } = useMutation({
    mutationFn: (auxiliarId: number | null) =>
      api.updateOrderAuxiliar(id, auxiliarId),
    onSuccess: (updated: Order) => {
      qc.setQueryData(['order', id], updated);
      qc.invalidateQueries({ queryKey: ['orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', err?.message || 'Não foi possível atualizar o auxiliar da OS.');
    },
  });

  const { mutate: setItemMechanic } = useMutation({
    mutationFn: ({ itemId, mecanicoId }: { itemId: string; mecanicoId: number | null }) =>
      api.updateItemMechanic(id, itemId, mecanicoId),
    onSuccess: (updated: Order) => {
      qc.setQueryData(['order', id], updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', err?.message || 'Não foi possível atribuir o mecânico a este item.');
    },
  });

  const { mutate: changeOrderStatus, isPending: changingStatus } = useMutation({
    mutationFn: (variables: { status: string; supervisorPin?: string; adminPassword?: string; isBalcao?: boolean } | string) => {
      if (typeof variables === 'string') {
        return api.updateOrderStatus(id, variables);
      }
      return api.updateOrderStatus(id, variables.status, {
        supervisorPin: variables.supervisorPin,
        adminPassword: variables.adminPassword,
        isBalcao: variables.isBalcao,
      });
    },
    onSuccess: (updated: Order, variables) => {
      qc.setQueryData(['order', id], updated);
      qc.invalidateQueries({ queryKey: ['orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const isClosing = typeof variables === 'string' ? variables === 'closed' : variables.status === 'closed';
      if (isClosing) {
        Alert.alert(
          'Sucesso!',
          'A comanda foi concluída e enviada ao Caixa / PDV para recebimento.',
          [
            { text: 'Voltar ao Início', onPress: () => router.replace('/') },
            { text: 'Permanecer aqui', style: 'default' },
          ]
        );
      }
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Atenção', err?.message || 'Não foi possível alterar o status da OS.');
    },
  });

  const { mutate: approveQuote, isPending: approvingQuote } = useMutation({
    mutationFn: () => api.approveQuote(id),
    onSuccess: (updated: Order) => {
      qc.setQueryData(['order', id], updated);
      qc.invalidateQueries({ queryKey: ['orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Orçamento Aprovado!', 'O orçamento foi aprovado e transformado em Ordem de Serviço.');
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Atenção ao Aprovar Orçamento',
        err?.message || 'Não foi possível aprovar o orçamento. Verifique se o endereço e CEP do cliente foram informados.'
      );
    },
  });

  // ─── Totais e Agrupamentos ───────────────────────────────────────────────────

  const items = order?.items ?? [];
  const parts = items.filter((i) => i.type === 'part');
  const services = items.filter((i) => i.type === 'service');
  const totalParts = items.reduce((acc, i) => acc + (i.total ?? 0), 0);
  const totalLabor = items.reduce((acc, i) => acc + (i.laborPrice ?? 0), 0);
  const discount = Number(order?.discountAmount ?? 0);
  const totalGeral = order?.vendaControle
    ? Number(order.totalAmount)
    : Math.max(0, totalParts + totalLabor - discount);

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectCatalogItem = useCallback(
    (item: CatalogItem) => {
      if (isClosed) return;
      Keyboard.dismiss();
      if (item.instalacoes && item.instalacoes.length > 0) {
        setInstalacaoTarget(item);
      } else {
        setPriceModalTarget({ mode: 'catalog', item });
      }
    },
    [isClosed],
  );

  const handleInstSelect = useCallback(
    (instalacaoId: number) => {
      if (!instalacaoTarget) return;
      const item = instalacaoTarget;
      setInstalacaoTarget(null);
      setPriceModalTarget({ mode: 'catalog', item, instalacaoId });
    },
    [instalacaoTarget],
  );

  const handleLaborRequest = useCallback(
    (item: OrderItem) => {
      if (isClosed) return;
      setEditingLaborItem(item);
    },
    [isClosed],
  );

  const handleConfirmEditLabor = useCallback(
    (laborPrice: number) => {
      if (!editingLaborItem) return;
      const itemId = editingLaborItem.id;
      setEditingLaborItem(null);
      updateItemLabor(
        { itemId, laborPrice },
        {
          onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
        }
      );
    },
    [editingLaborItem, updateItemLabor],
  );

  const handlePriceConfirm = useCallback(
    (totalServicePrice: number) => {
      if (!priceModalTarget) return;

      if (priceModalTarget.mode === 'catalog') {
        const { item, instalacaoId } = priceModalTarget;
        const laborPrice = Math.max(0, totalServicePrice - (item.unitPrice ?? 0));
        setPriceModalTarget(null);
        setSearch('');
        addItem(
          {
            catalogItemId: item.id,
            quantity: 1,
            laborPrice,
            ...(instalacaoId !== undefined ? { instalacaoId } : {}),
          },
          {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
            onError: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            },
          },
        );
      }
    },
    [priceModalTarget, addItem],
  );

  const handleDeleteRequest = useCallback((item: OrderItem) => {
    if (isClosed) return;
    setPendingAction({
      type: 'delete',
      itemId: item.id,
      itemDescription: `Excluir: ${item.description}`,
    });
  }, [isClosed]);

  const isBalcao = Boolean(
    order?.mecanicoNome?.toUpperCase().includes('BALC') ||
    order?.vehicle?.plate?.toUpperCase().includes('BALC') ||
    (items.length > 0 && totalLabor === 0)
  );

  const handleCloseRequest = useCallback(() => {
    if (!order) return;
    if (items.length === 0) {
      Alert.alert('Comanda Vazia', 'Adicione pelo menos um produto ou serviço antes de enviar a comanda ao caixa.');
      return;
    }

    if (isBalcao) {
      Alert.alert(
        'Enviar ao Caixa / PDV',
        `Deseja concluir esta Venda de Balcão (${currency(totalGeral)}) e liberá-la para recebimento imediato no Caixa?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Confirmar e Enviar',
            style: 'default',
            onPress: () => {
              changeOrderStatus({ status: 'closed', isBalcao: true });
            },
          },
        ]
      );
      return;
    }

    // Para OS normal de oficina:
    setPendingAction({
      type: 'close',
      itemId: order.id,
      itemDescription: `Concluir e Enviar ao Caixa: ${order.vehicle.plate}`,
    });
  }, [order, items.length, isBalcao, totalGeral, changeOrderStatus]);

  const handleReopenRequest = useCallback(() => {
    if (!order) return;
    setPendingAction({
      type: 'reopen',
      itemId: order.id,
      itemDescription: `Reabrir OS: ${order.vehicle.plate}`,
    });
  }, [order]);

  const handleShareOrPrint = useCallback(async () => {
    if (!order) return;
    const lines: string[] = [
      `📋 ${isQuote ? 'ORÇAMENTO' : 'ORDEM DE SERVIÇO'} #${order.id.split('-')[0].toUpperCase()}`,
      `Veículo: ${order.vehicle.plate} — ${order.vehicle.model}`,
      `Quilometragem: ${order.vehicle.mileage.toLocaleString('pt-BR')} km`,
      ...(order.client?.name ? [`Cliente: ${order.client.name}`] : []),
      ...(order.client?.phone ? [`Telefone: ${order.client.phone}`] : []),
      ...(order.client?.address ? [`Endereço: ${order.client.address}`] : []),
      ...(order.mecanicoNome ? [`Mecânico Titular: ${order.mecanicoNome}`] : []),
      ...(order.auxiliarNome ? [`Auxiliar: ${order.auxiliarNome}`] : []),
      '',
    ];

    if (parts.length > 0) {
      lines.push(`🔩 PEÇAS (${parts.length}):`);
      parts.forEach((i) => {
        lines.push(`  • ${i.description} (x${i.quantity})`);
        lines.push(`    Valor: ${currency(i.total)}${i.laborPrice > 0 ? ` + M.O.: ${currency(i.laborPrice)}` : ''}`);
      });
      lines.push('');
    }

    if (services.length > 0) {
      lines.push(`🔧 MÃO DE OBRA E SERVIÇOS (${services.length}):`);
      services.forEach((i) => {
        lines.push(`  • ${i.description} (x${i.quantity})`);
        lines.push(`    Valor: ${currency(i.total)}${i.laborPrice > 0 ? ` + M.O.: ${currency(i.laborPrice)}` : ''}`);
      });
      lines.push('');
    }

    lines.push(`Subtotal Peças:   ${currency(totalParts)}`);
    lines.push(`Subtotal M.O.:    ${currency(totalLabor)}`);
    if (discount > 0) {
      lines.push(`Desconto:        - ${currency(discount)}`);
    }
    lines.push(`TOTAL GERAL:      ${currency(totalGeral)}`);

    await Share.share({
      message: lines.join('\n'),
      title: `${isQuote ? 'Orçamento' : 'OS'} ${order.vehicle.plate}`,
    });
  }, [order, isQuote, parts, services, totalParts, totalLabor, discount, totalGeral]);

  const handleWhatsApp = (phone?: string | null) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    if (clean.length >= 8) {
      const url = `https://wa.me/55${clean}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Atenção', 'Não foi possível abrir o WhatsApp.');
      });
    }
  };

  const handleCallPhone = (phone?: string | null) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    if (clean) {
      Linking.openURL(`tel:${clean}`).catch(() => {});
    }
  };

  const handleQuantityChange = useCallback(
    (item: OrderItem, delta: 1 | -1) => {
      if (isClosed) return;
      const next = item.quantity + delta;

      if (next <= 0) {
        setPendingAction({
          type: 'delete',
          itemId: item.id,
          itemDescription: item.description,
        });
        return;
      }

      if (delta === -1) {
        setPendingAction({
          type: 'reduce',
          itemId: item.id,
          itemDescription: `Reduzir: ${item.description} → ${next} un.`,
          targetQuantity: next,
        });
        return;
      }

      updateQty({ itemId: item.id, quantity: next });
    },
    [updateQty, isClosed],
  );

  const handlePinAuthorized = useCallback((pin: string) => {
    if (!pendingAction) return;

    if (pendingAction.type === 'delete') {
      removeItem(pendingAction.itemId, {
        onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      });
    } else if (pendingAction.type === 'reduce' && pendingAction.targetQuantity !== undefined) {
      updateQty(
        { itemId: pendingAction.itemId, quantity: pendingAction.targetQuantity },
        { onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) },
      );
    } else if (pendingAction.type === 'close') {
      changeOrderStatus({ status: 'closed', supervisorPin: pin });
    } else if (pendingAction.type === 'reopen') {
      changeOrderStatus('open');
    }

    setPendingAction(null);
  }, [pendingAction, removeItem, updateQty, changeOrderStatus]);

  // ─── Estados de carregamento / erro ──────────────────────────────────────────

  if (orderLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-3 text-slate-400">Carregando OS…</Text>
      </View>
    );
  }

  if (orderError || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900 px-6">
        <Text className="text-5xl mb-4">⚠️</Text>
        <Text className="text-lg font-bold text-white text-center">
          Não foi possível carregar a OS
        </Text>
        <Text className="text-sm text-slate-400 text-center mt-2">
          Verifique a conexão com o servidor e tente novamente.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-5 px-5 py-2.5 rounded-xl bg-blue-600"
        >
          <Text className="text-white font-bold text-sm">Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const showSearchResults = !isClosed && debouncedSearch.length >= 2;

  useEffect(() => {
    if (showSearchResults && searchCardY.current > 0) {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, searchCardY.current - 15),
        animated: true,
      });
    }
  }, [showSearchResults]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-slate-950">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── CARD PRINCIPAL: VEÍCULO & STATUS ─────────────────────────────────── */}
        <View className="bg-slate-900 px-5 pt-14 pb-5 border-b border-slate-800 shadow-md">
          {/* Breadcrumb / OS #ID e Badge Status */}
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              {isQuote ? 'ORÇAMENTO' : 'OS'} #{order.id.split('-')[0].toUpperCase()}
            </Text>

            <View
              className={`px-3 py-1 rounded-full ${
                isQuote
                  ? 'bg-purple-950/80 border border-purple-700/60'
                  : order.status === 'open'
                  ? 'bg-emerald-950/80 border border-emerald-700/60'
                  : order.status === 'in_progress'
                  ? 'bg-amber-950/80 border border-amber-700/60'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <Text
                className={`text-[11px] font-extrabold uppercase ${
                  isQuote
                    ? 'text-purple-300'
                    : order.status === 'open'
                    ? 'text-emerald-400'
                    : order.status === 'in_progress'
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {isQuote
                  ? 'Orçamento'
                  : order.status === 'open'
                  ? 'Aberta'
                  : order.status === 'in_progress'
                  ? 'Em andamento'
                  : 'Encerrada'}
              </Text>
            </View>
          </View>

          {/* Placa em Grande Destaque (Estilo Placa) */}
          <View className="flex-row items-baseline gap-2 mt-0.5">
            <Text className="text-3xl font-extrabold text-white tracking-wider">
              {order.vehicle.plate}
            </Text>
          </View>

          <Text className="text-sm text-slate-400 mt-1">
            {order.vehicle.model} · {order.vehicle.mileage.toLocaleString('pt-BR')} km
          </Text>

          <Text className="text-[11px] text-slate-500 mt-1">
            Criada em {fmtDate(order.createdAt as unknown as string)}
            {isClosed && order.closedAt ? ` · Encerrada: ${fmtDate(order.closedAt)}` : ''}
          </Text>

          {/* ── SELETORES: MECÂNICO TITULAR & AUXILIAR ───────────────────────────── */}
          <View className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
            {/* Mecânico Titular */}
            <TouchableOpacity
              onPress={() => {
                if (!isClosed) {
                  setMecanicoModalTarget({
                    type: 'titular',
                    selectedId: order.mecanicoId ?? null,
                  });
                }
              }}
              disabled={isClosed}
              activeOpacity={isClosed ? 1 : 0.7}
              className="flex-row items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700"
            >
              <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                <Text style={{ fontSize: 16 }}>🔧</Text>
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mecânico Titular
                  </Text>
                  <Text
                    className="text-xs font-bold text-white mt-0.5"
                    numberOfLines={1}
                  >
                    {order.mecanicoNome || 'Não atribuído (Geral da Oficina)'}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-1.5">
                {order.mecanicoNome ? (
                  <View className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800">
                    <Text className="text-[10px] font-bold text-emerald-400">✓ Titular</Text>
                  </View>
                ) : null}
                {!isClosed && (
                  <Text className="text-slate-400 text-xs">▼</Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Auxiliar de Mecânico */}
            <TouchableOpacity
              onPress={() => {
                if (!isClosed) {
                  setMecanicoModalTarget({
                    type: 'auxiliar',
                    selectedId: order.auxiliarId ?? null,
                  });
                }
              }}
              disabled={isClosed}
              activeOpacity={isClosed ? 1 : 0.7}
              className="flex-row items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 mt-2"
            >
              <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                <Text style={{ fontSize: 16 }}>🤝</Text>
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Auxiliar de Mecânico
                  </Text>
                  <Text
                    className="text-xs font-bold text-amber-200 mt-0.5"
                    numberOfLines={1}
                  >
                    {order.auxiliarNome || 'Nenhum auxiliar escalado'}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-1.5">
                {order.auxiliarNome ? (
                  <View className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-800">
                    <Text className="text-[10px] font-bold text-amber-300">✓ Atribuído</Text>
                  </View>
                ) : null}
                {!isClosed && (
                  <Text className="text-amber-400 text-xs">▼</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* ── BOTÕES NO CABEÇALHO: IMPRIMIR & FINALIZAR OS ────────────────────── */}
          <View className="flex-row gap-2.5 mt-4 pt-3 border-t border-slate-800">
            <TouchableOpacity
              onPress={handleShareOrPrint}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex-row items-center justify-center gap-1.5"
            >
              <Text style={{ fontSize: 13 }}>🖨️</Text>
              <Text className="text-xs font-bold text-slate-200">
                Imprimir
              </Text>
            </TouchableOpacity>

            {isQuote ? (
              <TouchableOpacity
                onPress={() => approveQuote()}
                disabled={approvingQuote}
                className="flex-1 py-2.5 rounded-xl bg-green-600 items-center justify-center shadow-md flex-row gap-1.5"
              >
                {approvingQuote ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Text style={{ fontSize: 13 }}>✅</Text>
                    <Text className="text-xs font-bold text-white">Aprovar Orçamento</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : !isClosed ? (
              <TouchableOpacity
                onPress={handleCloseRequest}
                disabled={changingStatus}
                className={`flex-1 py-2.5 rounded-xl items-center justify-center shadow-md flex-row gap-1.5 ${
                  isBalcao
                    ? 'bg-emerald-600'
                    : 'bg-red-900/60 border border-red-800/80'
                }`}
              >
                {changingStatus ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Text style={{ fontSize: 13 }}>{isBalcao ? '💳' : '🔒'}</Text>
                    <Text className={`text-xs font-bold ${isBalcao ? 'text-white' : 'text-red-300'}`}>
                      {isBalcao ? 'Enviar ao Caixa' : 'Finalizar OS'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleReopenRequest}
                disabled={changingStatus}
                className="flex-1 py-2.5 rounded-xl bg-amber-900/40 border border-amber-800/70 items-center justify-center flex-row gap-1.5"
              >
                <Text style={{ fontSize: 13 }}>🔓</Text>
                <Text className="text-xs font-bold text-amber-300">
                  Reabrir OS
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── CARD DADOS DO CLIENTE ───────────────────────────────────────────── */}
        <View className="mx-4 mt-3 bg-slate-900 rounded-2xl border border-slate-800 p-4 shadow-sm">
          <View className="flex-row items-center justify-between pb-2.5 border-b border-slate-800">
            <View className="flex-row items-center gap-1.5">
              <Text style={{ fontSize: 14 }}>👤</Text>
              <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Dados do Cliente
              </Text>
            </View>

            {!isClosed && (
              <TouchableOpacity
                onPress={() => setClientModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 flex-row items-center gap-1"
              >
                <Text className="text-xs text-blue-400 font-bold">✏️ Editar</Text>
              </TouchableOpacity>
            )}
          </View>

          {order.client?.name ? (
            <View className="mt-3 space-y-2">
              <Text className="text-base font-extrabold text-white">
                {order.client.name}
              </Text>

              {/* Telefone e WhatsApp */}
              {order.client.phone ? (
                <View className="flex-row items-center gap-2 flex-wrap mt-1">
                  <TouchableOpacity
                    onPress={() => handleCallPhone(order.client?.phone)}
                    className="flex-row items-center gap-1 py-0.5 px-2 rounded-lg bg-slate-800/60 border border-slate-700/60"
                  >
                    <Text className="text-xs text-slate-300 font-mono">
                      📞 {order.client.phone}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleWhatsApp(order.client?.phone)}
                    className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-800/70"
                  >
                    <Text style={{ fontSize: 11 }}>💬</Text>
                    <Text className="text-[11px] font-bold text-emerald-400">
                      WhatsApp
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Documento */}
              {order.client.document ? (
                <Text className="text-xs text-slate-400 font-mono mt-0.5">
                  Doc: {order.client.document}
                </Text>
              ) : null}

              {/* CEP & Endereço */}
              <View className="pt-2 border-t border-slate-800/60 space-y-1.5 mt-2">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-xs text-slate-400 font-medium">CEP:</Text>
                  {order.client.cep ? (
                    <Text className="text-xs font-mono font-bold text-slate-200">
                      {order.client.cep}
                    </Text>
                  ) : (
                    <Text className="text-[11px] text-amber-400/80 font-medium">
                      Não informado
                    </Text>
                  )}
                </View>

                <View className="flex-row items-start gap-1.5">
                  <Text className="text-xs text-slate-400 font-medium shrink-0">
                    Endereço:
                  </Text>
                  {order.client.address ? (
                    <Text className="text-xs text-slate-200 leading-snug flex-1">
                      {order.client.address}
                    </Text>
                  ) : (
                    <Text className="text-[11px] text-amber-400/80 font-medium">
                      Não informado
                    </Text>
                  )}
                </View>
              </View>

              {/* ID ERP */}
              {order.client.id ? (
                <View className="pt-2 border-t border-slate-800/60 flex-row items-center justify-between text-[11px]">
                  <Text className="text-[11px] text-slate-500">Cadastro ERP:</Text>
                  <Text className="text-[11px] font-mono text-slate-400">
                    ID #{order.client.id}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View className="py-3">
              <Text className="text-xs text-amber-400 font-semibold">
                ⚠️ Cliente não cadastrado
              </Text>
              <Text className="text-[11px] text-slate-500 mt-0.5">
                Toque em Editar para registrar o nome e telefone.
              </Text>
            </View>
          )}
        </View>

        {/* ── CARD ADICIONAR PEÇAS E SERVIÇOS ─────────────────────────────────── */}
        {!isClosed && (
          <View
            onLayout={(e) => {
              searchCardY.current = e.nativeEvent.layout.y;
            }}
            className="mx-4 mt-3 bg-slate-900 rounded-2xl border border-slate-800 p-4 shadow-sm"
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Text style={{ fontSize: 16 }}>🛒</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-white">
                  {isQuote ? 'Adicionar Peças e Serviços ao Orçamento' : 'Adicionar Peças e Serviços à OS'}
                </Text>
                <Text className="text-[11px] text-slate-400">
                  Busque pelo nome ou código de barras para lançar itens
                </Text>
              </View>
            </View>

            <SearchBar
              value={search}
              onChangeText={setSearch}
              onFocus={() => {
                if (searchCardY.current > 0) {
                  scrollViewRef.current?.scrollTo({
                    y: Math.max(0, searchCardY.current - 15),
                    animated: true,
                  });
                }
              }}
              loading={searching || adding}
              placeholder="Buscar por código de barras, código ou nome…"
              disabled={isClosed}
            />

            {/* Resultados de busca embutidos */}
            {showSearchResults && (
              <View className="mt-2 rounded-xl overflow-hidden border border-slate-700 bg-slate-800 shadow-lg">
                {(searchResults ?? []).length === 0 && !searching ? (
                  <View className="py-6 items-center">
                    <Text className="text-slate-400 text-xs">
                      Nenhum item encontrado para &ldquo;{debouncedSearch}&rdquo;
                    </Text>
                  </View>
                ) : (
                  (searchResults ?? []).slice(0, 10).map((item) => (
                    <SearchResultItem
                      key={item.id}
                      item={item}
                      onPress={handleSelectCatalogItem}
                    />
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* ── SEÇÃO: PEÇAS (EXIBIÇÃO SEPARADA) ─────────────────────────────────── */}
        {parts.length > 0 && (
          <View className="mx-4 mt-4">
            <View className="flex-row items-center justify-between mb-2 px-1">
              <View className="flex-row items-center gap-1.5">
                <Text style={{ fontSize: 14 }}>🔩</Text>
                <Text className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">
                  Peças
                </Text>
              </View>
              <View className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                <Text className="text-[11px] font-bold text-slate-400">
                  {parts.length} {parts.length === 1 ? 'item' : 'itens'}
                </Text>
              </View>
            </View>

            {parts.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onDeleteRequest={handleDeleteRequest}
                onQuantityChange={handleQuantityChange}
                onLaborRequest={handleLaborRequest}
                onMechanicRequest={(it) =>
                  setMecanicoModalTarget({
                    type: 'item',
                    item: it,
                    selectedId: it.mecanicoId ?? null,
                  })
                }
                readOnly={isClosed}
              />
            ))}
          </View>
        )}

        {/* ── SEÇÃO: MÃO DE OBRA E SERVIÇOS (EXIBIÇÃO SEPARADA) ────────────────── */}
        {services.length > 0 && (
          <View className="mx-4 mt-4">
            <View className="flex-row items-center justify-between mb-2 px-1">
              <View className="flex-row items-center gap-1.5">
                <Text style={{ fontSize: 14 }}>🔧</Text>
                <Text className="text-xs font-extrabold text-blue-400 uppercase tracking-wider">
                  Mão de Obra e Serviços
                </Text>
              </View>
              <View className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                <Text className="text-[11px] font-bold text-slate-400">
                  {services.length} {services.length === 1 ? 'item' : 'itens'}
                </Text>
              </View>
            </View>

            {services.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onDeleteRequest={handleDeleteRequest}
                onQuantityChange={handleQuantityChange}
                onLaborRequest={handleLaborRequest}
                onMechanicRequest={(it) =>
                  setMecanicoModalTarget({
                    type: 'item',
                    item: it,
                    selectedId: it.mecanicoId ?? null,
                  })
                }
                readOnly={isClosed}
              />
            ))}
          </View>
        )}

        {/* Estado vazio se não houver itens lançados */}
        {items.length === 0 && !showSearchResults && (
          <View className="items-center py-16 px-8 mx-4 mt-4 bg-slate-900 rounded-2xl border border-slate-800">
            <Text style={{ fontSize: 44 }}>🔩</Text>
            <Text className="text-base font-bold text-white text-center mt-2">
              Nenhum item lançado ainda
            </Text>
            <Text className="text-xs text-slate-400 text-center mt-1">
              {isClosed
                ? 'Esta Ordem de Serviço foi encerrada sem itens cadastrados.'
                : 'Utilize o campo de busca acima para pesquisar peças e serviços no catálogo.'}
            </Text>
          </View>
        )}

        {/* ── RESUMO DE VALORES ───────────────────────────────────────────────── */}
        {items.length > 0 && (
          <View className="mx-4 mt-4 bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-sm">
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Resumo dos Valores
            </Text>

            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-slate-400">Total Peças</Text>
              <Text className="text-xs font-bold text-amber-400 font-mono">
                {currency(totalParts)}
              </Text>
            </View>

            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-slate-400">Total Mão de Obra</Text>
              <Text className={`text-xs font-bold font-mono ${totalLabor > 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                {currency(totalLabor)}
              </Text>
            </View>

            {discount > 0 && (
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-red-400">Desconto Aplicado</Text>
                <Text className="text-xs font-bold text-red-400 font-mono">
                  - {currency(discount)}
                </Text>
              </View>
            )}

            <View className="border-t border-slate-800 pt-2.5 mt-1 flex-row justify-between items-baseline">
              <Text className="text-sm font-bold text-white">
                {order.vendaControle ? 'Total Faturado PDV' : 'Total Geral'}
              </Text>
              <Text className="text-base font-extrabold text-emerald-400 font-mono">
                {currency(totalGeral)}
              </Text>
            </View>

            {order.vendaControle ? (
              <View className="mt-2.5 p-2 rounded-xl bg-emerald-950/70 border border-emerald-800/80 items-center">
                <Text className="text-xs font-bold text-emerald-300 font-mono">
                  ✓ Faturada no PDV · Venda #{order.vendaControle}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* ── MODAIS ───────────────────────────────────────────────────────────── */}

      {/* Modal de Edição de Dados do Cliente */}
      <ClientEditModal
        visible={clientModalOpen}
        client={order.client}
        onSave={(data) => updateClient(data)}
        onClose={() => setClientModalOpen(false)}
        isSaving={savingClient}
      />

      {/* Modal de Seleção de Mecânico (Titular, Auxiliar ou Item) */}
      <MecanicoSelectorModal
        visible={mecanicoModalTarget !== null}
        title={
          mecanicoModalTarget?.type === 'titular'
            ? 'Mecânico Titular da OS'
            : mecanicoModalTarget?.type === 'auxiliar'
            ? 'Auxiliar de Mecânico da OS'
            : `Técnico: ${mecanicoModalTarget?.item?.description || ''}`
        }
        subtitle={
          mecanicoModalTarget?.type === 'titular'
            ? 'Selecione o mecânico responsável principal'
            : mecanicoModalTarget?.type === 'auxiliar'
            ? 'Selecione o auxiliar escalado para apoio'
            : 'Atribuir a execução e comissão deste item para:'
        }
        mecanicos={mecanicos}
        selectedId={mecanicoModalTarget?.selectedId ?? null}
        allowClear={true}
        clearLabel={
          mecanicoModalTarget?.type === 'item'
            ? 'Padrão da OS (Sem técnico individual)'
            : 'Não atribuído'
        }
        onSelect={(mec: Mecanico | null) => {
          if (!mecanicoModalTarget) return;
          if (mecanicoModalTarget.type === 'titular') {
            updateMechanic(mec?.id ?? null);
          } else if (mecanicoModalTarget.type === 'auxiliar') {
            updateAuxiliar(mec?.id ?? null);
          } else if (mecanicoModalTarget.type === 'item') {
            setItemMechanic({
              itemId: mecanicoModalTarget.item.id,
              mecanicoId: mec?.id ?? null,
            });
          }
          setMecanicoModalTarget(null);
        }}
        onClose={() => setMecanicoModalTarget(null)}
      />

      {/* Modal de Posição de Instalação */}
      <InstalacaoModal
        visible={instalacaoTarget !== null}
        productDescription={instalacaoTarget?.description ?? ''}
        instalacoes={instalacaoTarget?.instalacoes ?? []}
        onSelect={handleInstSelect}
        onCancel={() => setInstalacaoTarget(null)}
      />

      {/* Modal de Preço Total do Serviço (para inclusão do catálogo) */}
      <ServicePriceModal
        visible={priceModalTarget !== null}
        title={priceModalTarget ? priceModalTarget.item.description : 'Preço Total'}
        description={
          priceModalTarget
            ? `${priceModalTarget.item.type === 'service' ? 'Serviço' : 'Peça'}: ${currency(
                priceModalTarget.item.unitPrice
              )} — Digite o preço total cobrado (peça + instalação)`
            : undefined
        }
        initialValue={priceModalTarget ? priceModalTarget.item.unitPrice : 0}
        allowZero={false}
        onConfirm={handlePriceConfirm}
        onCancel={() => setPriceModalTarget(null)}
      />

      {/* Modal de Edição Exclusiva de Mão de Obra do Item */}
      <ServicePriceModal
        visible={editingLaborItem !== null}
        title="Mão de Obra do Item"
        description={editingLaborItem ? editingLaborItem.description : undefined}
        inputLabel="Valor da Mão de Obra (R$)"
        initialValue={editingLaborItem?.laborPrice ?? 0}
        allowZero={true}
        onConfirm={handleConfirmEditLabor}
        onCancel={() => setEditingLaborItem(null)}
      />

      {/* Modal de PIN (para exclusão, redução e fechamento de OS) */}
      <PinModal
        visible={pendingAction !== null}
        itemDescription={pendingAction?.itemDescription}
        onAuthorized={handlePinAuthorized}
        onCancel={() => setPendingAction(null)}
      />
    </View>
  );
}
