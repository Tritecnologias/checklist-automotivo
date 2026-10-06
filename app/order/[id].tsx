import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
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
import {
  useAddItem,
  useRemoveItem,
  useUpdateItemLabor,
  useUpdateQuantity,
} from '@/hooks/useOrderMutations';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import type { CatalogItem, Order, OrderItem, PendingAction } from '@/types';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [instalacaoTarget, setInstalacaoTarget] = useState<CatalogItem | null>(null);
  const [priceModalTarget, setPriceModalTarget] = useState<
    | { mode: 'catalog'; item: CatalogItem; instalacaoId?: number }
    | { mode: 'orderItem'; item: OrderItem }
    | null
  >(null);
  const debouncedSearch = useDebounce(search, 400);

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

  // ─── Mutações ─────────────────────────────────────────────────────────────────

  const qc = useQueryClient();

  const { mutate: addItem, isPending: adding } = useAddItem(id);
  const { mutate: removeItem } = useRemoveItem(id);
  const { mutate: updateQty } = useUpdateQuantity(id);
  const { mutate: updateItemLabor } = useUpdateItemLabor(id);

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
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Atenção ao Aprovar Orçamento',
        err?.message || 'Não foi possível aprovar o orçamento. Verifique se o endereço e CEP do cliente foram informados.'
      );
    },
  });

  const { mutate: assumirOS, isPending: assumindoOS } = useMutation({
    mutationFn: () => {
      if (!user?.mecanicoId) throw new Error('Usuário sem perfil de mecânico');
      return api.updateOrderMechanic(id, user.mecanicoId, true);
    },
    onSuccess: (updated: Order) => {
      qc.setQueryData(['order', id], updated);
      qc.invalidateQueries({ queryKey: ['orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // ─── Totais ───────────────────────────────────────────────────────────────────

  const items = order?.items ?? [];
  const totalParts  = items.reduce((acc, i) => acc + (i.total ?? 0), 0);
  const totalLabor  = items.reduce((acc, i) => acc + (i.laborPrice ?? 0), 0);
  const totalGeral  = totalParts + totalLabor;

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectCatalogItem = useCallback(
    (item: CatalogItem) => {
      if (isClosed) return;
      Keyboard.dismiss();
      if (item.instalacoes.length > 0) {
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
      setPriceModalTarget({ mode: 'orderItem', item });
    },
    [isClosed],
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
          { catalogItemId: item.id, quantity: 1, laborPrice, ...(instalacaoId !== undefined ? { instalacaoId } : {}) },
          {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
            onError: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            },
          },
        );
      } else {
        const { item } = priceModalTarget;
        const laborPrice = Math.max(0, totalServicePrice - (item.total ?? 0));
        setPriceModalTarget(null);
        updateItemLabor(
          { itemId: item.id, laborPrice },
          {
            onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
            onError:   () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
          },
        );
      }
    },
    [priceModalTarget, addItem, updateItemLabor],
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

    // Para OS normal de oficina (com serviços/mão de obra):
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

  const handleShare = useCallback(async () => {
    if (!order) return;
    const lines: string[] = [
      `OS #${order.id.split('-')[0].toUpperCase()}`,
      ...(order.client?.name ? [`Cliente: ${order.client.name}${order.client.phone ? ` (${order.client.phone})` : ''}`] : []),
      `Veículo: ${order.vehicle.plate} — ${order.vehicle.model}`,
      `Quilometragem: ${order.vehicle.mileage.toLocaleString('pt-BR')} km`,
      ...(order.mecanicoNome ? [`Mecânico: ${order.mecanicoNome}`] : []),
      ...(order.auxiliarNome ? [`Auxiliar: ${order.auxiliarNome}`] : []),
      '',
    ];

    if (order.items.length) {
      lines.push('PEÇAS / SERVIÇOS:');
      order.items.forEach((i) => {
        lines.push(`  • ${i.description} x${i.quantity}`);
        lines.push(`    Peça: ${currency(i.total)}${i.laborPrice > 0 ? `  |  M.O.: ${currency(i.laborPrice)}` : ''}`);
      });
      lines.push('');
    }

    lines.push(`Total Peças:  ${currency(totalParts)}`);
    lines.push(`Total M.O.:   ${currency(totalLabor)}`);
    lines.push(`TOTAL GERAL:  ${currency(totalGeral)}`);

    await Share.share({ message: lines.join('\n'), title: `OS ${order.vehicle.plate}` });
  }, [order, totalParts, totalLabor, totalGeral]);

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
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-3 text-gray-500 dark:text-slate-400">Carregando OS…</Text>
      </View>
    );
  }

  if (orderError || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
        <Text className="text-5xl mb-4">⚠️</Text>
        <Text className="text-lg font-bold text-gray-900 dark:text-white text-center">
          Não foi possível carregar a OS
        </Text>
        <Text className="text-sm text-gray-500 dark:text-slate-400 text-center mt-2">
          Verifique a conexão com o servidor e tente novamente.
        </Text>
      </View>
    );
  }

  const showSearchResults = !isClosed && debouncedSearch.length >= 2;



  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">

      {/* Cabeçalho da OS */}
      <View className="bg-white dark:bg-slate-900 px-5 pt-14 pb-4 border-b border-gray-100 dark:border-slate-800">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-mono text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              OS #{order.id.split('-')[0].toUpperCase()}
            </Text>
            <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {order.vehicle.plate}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              {order.vehicle.model} · {order.vehicle.mileage.toLocaleString('pt-BR')} km
            </Text>
            {order.client?.name ? (
              <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1">
                👤 {order.client.name} {order.client.phone ? `· 📞 ${order.client.phone}` : ''}
              </Text>
            ) : null}
            <Text className="text-xs text-gray-400 dark:text-slate-500 mt-1">
              Aberta: {fmtDate(order.createdAt as unknown as string)}
              {isClosed && order.closedAt
                ? `  ·  Encerrada: ${fmtDate(order.closedAt)}`
                : ''}
            </Text>
          </View>

          <View
            className={`px-3 py-1.5 rounded-full ${
              order.status === 'quote'
                ? 'bg-purple-100 dark:bg-purple-900/40'
                : order.status === 'open'
                ? 'bg-green-100 dark:bg-green-900/30'
                : order.status === 'in_progress'
                ? 'bg-amber-100 dark:bg-amber-900/30'
                : 'bg-gray-100 dark:bg-slate-700'
            }`}
          >
            <Text
              className={`text-xs font-bold uppercase ${
                order.status === 'quote'
                  ? 'text-purple-700 dark:text-purple-300'
                  : order.status === 'open'
                  ? 'text-green-700 dark:text-green-400'
                  : order.status === 'in_progress'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              {order.status === 'quote'
                ? 'Orçamento'
                : order.status === 'open'
                ? 'Aberta'
                : order.status === 'in_progress'
                ? 'Em andamento'
                : 'Encerrada'}
            </Text>
          </View>
        </View>

        {/* Técnico / Mecânico Responsável */}
        <View className="mt-3">
          {order.mecanicoNome ? (
            <View className="flex-row items-center justify-between py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <View className="flex-row items-center gap-2 flex-1 mr-2">
                <Text style={{ fontSize: 14 }}>🔧</Text>
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                    Técnico Responsável
                  </Text>
                  <Text className="text-xs font-bold text-slate-800 dark:text-white" numberOfLines={1}>
                    {order.mecanicoNome}
                    {user?.mecanicoId && order.mecanicoId === user.mecanicoId ? ' (Você)' : ''}
                  </Text>
                </View>
              </View>

              {!isClosed && user?.mecanicoId && order.mecanicoId !== user.mecanicoId && (
                <TouchableOpacity
                  onPress={() => assumirOS()}
                  disabled={assumindoOS}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 dark:bg-blue-500"
                >
                  <Text className="text-[11px] font-bold text-white">
                    {assumindoOS ? 'Assumindo…' : 'Mudar p/ mim'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View className="py-2.5 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2 flex-1 mr-2">
                <Text style={{ fontSize: 16 }}>⏳</Text>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Sem técnico atribuído
                  </Text>
                  <Text className="text-[11px] text-amber-700 dark:text-amber-400">
                    Esta OS ainda não possui técnico
                  </Text>
                </View>
              </View>

              {!isClosed && user?.mecanicoId && (
                <TouchableOpacity
                  onPress={() => assumirOS()}
                  disabled={assumindoOS}
                  className="px-3 py-2 rounded-xl bg-blue-600 dark:bg-blue-500 shadow-sm flex-row items-center gap-1.5"
                >
                  {assumindoOS ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 12 }}>🔧</Text>
                      <Text className="text-xs font-bold text-white">
                        Assumir OS
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Auxiliar de Mecânico (se atribuído) */}
        {order.auxiliarNome ? (
          <View className="mt-2 flex-row items-center py-2 px-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <View className="flex-row items-center gap-2 flex-1">
              <Text style={{ fontSize: 14 }}>🤝</Text>
              <View className="flex-1">
                <Text className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                  Auxiliar de Mecânico
                </Text>
                <Text className="text-xs font-bold text-slate-800 dark:text-white" numberOfLines={1}>
                  {order.auxiliarNome}
                  {user?.mecanicoId && order.auxiliarId === user.mecanicoId ? ' (Você)' : ''}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Banner de Orçamento */}
        {order.status === 'quote' && (
          <View className="mt-3 p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60">
            <View className="flex-row items-center gap-2 mb-2.5">
              <Text style={{ fontSize: 16 }}>📋</Text>
              <Text className="text-xs font-bold text-purple-900 dark:text-purple-200">
                Orçamento Aguardando Aprovação
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => approveQuote()}
              disabled={approvingQuote}
              className="py-3 rounded-xl bg-green-600 dark:bg-green-500 items-center justify-center shadow-sm"
            >
              {approvingQuote ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-white font-bold text-sm">
                  ✅ Aprovar Orçamento (Gerar OS)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Banner somente-leitura */}
        {isClosed && (
          <View className="flex-row items-center gap-2 mt-3 px-3.5 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <Text style={{ fontSize: 18 }}>{order.vendaControle ? '✅' : '💳'}</Text>
            <View className="flex-1">
              <Text className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                {order.vendaControle
                  ? `OS Faturada no Caixa (Venda #${order.vendaControle})`
                  : 'Comanda Enviada ao Caixa / PDV'}
              </Text>
              <Text className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                {order.vendaControle
                  ? 'Esta ordem foi paga e finalizada no PDV. Somente leitura.'
                  : 'Aguardando recebimento no terminal de caixa do PDV.'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Barra de busca */}
      <SearchBar
        value={search}
        onChangeText={setSearch}
        loading={searching || adding}
        placeholder="Buscar peça / serviço por código ou descrição…"
        disabled={isClosed}
      />

      {/* Resultados de busca (overlay) */}
      {showSearchResults && (
        <View className="mx-4 rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 shadow-lg bg-white dark:bg-slate-800 z-10">
          {(searchResults ?? []).length === 0 && !searching ? (
            <View className="py-8 items-center">
              <Text className="text-gray-400 dark:text-slate-500 text-sm">
                Nenhum item encontrado para "{debouncedSearch}"
              </Text>
            </View>
          ) : (
            <FlatList
              data={searchResults ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <SearchResultItem item={item} onPress={handleSelectCatalogItem} />
              )}
              style={{ maxHeight: 300 }}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      )}

      {/* Lista de itens lançados */}
      {!showSearchResults && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              onDeleteRequest={handleDeleteRequest}
              onQuantityChange={handleQuantityChange}
              onLaborRequest={handleLaborRequest}
              readOnly={isClosed}
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-16 px-8">
              <Text style={{ fontSize: 48 }}>🔩</Text>
              <Text className="text-gray-500 dark:text-slate-400 text-base text-center mt-3">
                {isClosed
                  ? 'Nenhum item registrado nesta OS.'
                  : 'Nenhum item lançado ainda.\nUse a busca acima para adicionar.'}
              </Text>
            </View>
          }
          ListHeaderComponent={
            items.length > 0 ? (
              <Text className="px-4 pt-4 pb-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                {items.length} {items.length === 1 ? 'item lançado' : 'itens lançados'}
              </Text>
            ) : null
          }
          ListFooterComponent={
            items.length > 0 ? (
              <View className="mx-4 my-4 bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700">
                <Text className="text-sm font-semibold text-gray-500 dark:text-slate-400 mb-3">
                  Resumo
                </Text>

                {/* Total Peças */}
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-gray-600 dark:text-slate-400">
                    Total Peças
                  </Text>
                  <Text className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    {currency(totalParts)}
                  </Text>
                </View>

                {/* Total MO */}
                <View className="flex-row justify-between mb-3">
                  <Text className="text-sm text-gray-600 dark:text-slate-400">
                    Total Mão de Obra
                  </Text>
                  <Text className={`text-sm font-medium ${totalLabor > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}>
                    {currency(totalLabor)}
                  </Text>
                </View>

                {/* Total Geral */}
                <View className="border-t border-gray-100 dark:border-slate-700 pt-3 flex-row justify-between">
                  <Text className="text-base font-bold text-gray-900 dark:text-white">
                    Total Geral
                  </Text>
                  <Text className="text-base font-bold text-green-600 dark:text-green-400">
                    {currency(totalGeral)}
                  </Text>
                </View>

                {/* Ações */}
                <View className="flex-row gap-3 mt-4">
                  <TouchableOpacity
                    onPress={handleShare}
                    className="flex-1 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 items-center"
                  >
                    <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      📤 Compartilhar
                    </Text>
                  </TouchableOpacity>

                  {!isClosed ? (
                    <TouchableOpacity
                      onPress={handleCloseRequest}
                      disabled={changingStatus}
                      className={`flex-1 py-3.5 rounded-xl items-center flex-row justify-center gap-1.5 ${
                        isBalcao
                          ? 'bg-emerald-600 dark:bg-emerald-500'
                          : 'bg-blue-600 dark:bg-blue-500'
                      }`}
                    >
                      {changingStatus ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Text style={{ fontSize: 14 }}>{isBalcao ? '💳' : '🏁'}</Text>
                          <Text className="text-sm font-bold text-white">
                            {isBalcao ? 'Enviar ao Caixa' : 'Concluir e Enviar ao Caixa'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={handleReopenRequest}
                      disabled={changingStatus}
                      className="flex-1 py-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 items-center flex-row justify-center gap-1.5 border border-amber-200 dark:border-amber-800"
                    >
                      {changingStatus ? (
                        <ActivityIndicator size="small" color="#d97706" />
                      ) : (
                        <>
                          <Text style={{ fontSize: 14 }}>🔓</Text>
                          <Text className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                            Reabrir OS
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Modal de seleção obrigatória de instalação */}
      <InstalacaoModal
        visible={instalacaoTarget !== null}
        productDescription={instalacaoTarget?.description ?? ''}
        instalacoes={instalacaoTarget?.instalacoes ?? []}
        onSelect={handleInstSelect}
        onCancel={() => setInstalacaoTarget(null)}
      />

      {/* Modal de preço total do serviço por item */}
      <ServicePriceModal
        visible={priceModalTarget !== null}
        title={priceModalTarget ? priceModalTarget.item.description : 'Preço Total'}
        description={priceModalTarget
          ? `${priceModalTarget.item.type === 'service' ? 'Serviço' : 'Peça'}: ${currency(
              priceModalTarget.mode === 'catalog'
                ? priceModalTarget.item.unitPrice
                : priceModalTarget.item.total
            )} — Digite o preço total cobrado (peça + instalação)`
          : undefined}
        initialValue={priceModalTarget
          ? priceModalTarget.mode === 'catalog'
            ? priceModalTarget.item.unitPrice
            : (priceModalTarget.item.total ?? 0) + (priceModalTarget.item.laborPrice ?? 0)
          : 0}
        onConfirm={handlePriceConfirm}
        onCancel={() => setPriceModalTarget(null)}
      />

      {/* Modal de PIN — para todas as ações que exigem supervisor */}
      <PinModal
        visible={pendingAction !== null}
        itemDescription={pendingAction?.itemDescription}
        onAuthorized={handlePinAuthorized}
        onCancel={() => setPendingAction(null)}
      />
    </View>
  );
}
