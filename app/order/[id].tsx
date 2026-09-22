import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import {
  useAddItem,
  useRemoveItem,
  useUpdateItemLabor,
  useUpdateQuantity,
} from '@/hooks/useOrderMutations';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import type { CatalogItem, Order, OrderItem, PendingAction } from '@/types';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [search, setSearch] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [laborItem, setLaborItem] = useState<OrderItem | null>(null);
  const [pinVerified, setPinVerified] = useState(false);
  const [showUnlockPin, setShowUnlockPin] = useState(false);
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
    mutationFn: (status: string) => api.updateOrderStatus(id, status),
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

  const handleAddCatalogItem = useCallback(
    (item: CatalogItem) => {
      if (isClosed) return; // guard extra no front
      addItem(
        { catalogItemId: item.id, quantity: 1 },
        {
          onSuccess: () => {
            setSearch('');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
          onError: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          },
        },
      );
    },
    [addItem, isClosed],
  );

  const handleLaborRequest = useCallback((item: OrderItem) => {
    if (isClosed) return;
    setLaborItem(item);
  }, [isClosed]);

  const handleLaborConfirm = useCallback(
    (totalServicePrice: number) => {
      if (!laborItem) return;
      setLaborItem(null);
      // O operador digita o preço total (peça + instalação).
      // Internamente armazenamos só a MO = total - valor da peça.
      const laborPrice = Math.max(0, totalServicePrice - (laborItem.total ?? 0));
      updateItemLabor(
        { itemId: laborItem.id, laborPrice },
        {
          onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          onError:   () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
        },
      );
    },
    [laborItem, updateItemLabor],
  );

  const handleDeleteRequest = useCallback((item: OrderItem) => {
    if (isClosed) return;
    setPendingAction({
      type: 'delete',
      itemId: item.id,
      itemDescription: `Excluir: ${item.description}`,
    });
  }, [isClosed]);

  const handleCloseRequest = useCallback(() => {
    if (!order) return;
    setPendingAction({
      type: 'close',
      itemId: order.id,
      itemDescription: `Encerrar OS: ${order.vehicle.plate}`,
    });
  }, [order]);

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
      `Veículo: ${order.vehicle.plate} — ${order.vehicle.model}`,
      `Quilometragem: ${order.vehicle.mileage.toLocaleString('pt-BR')} km`,
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

  const handlePinAuthorized = useCallback(() => {
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
      changeOrderStatus('closed');
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

  // ─── Tela de bloqueio para OS encerrada ───────────────────────────────────────

  if (isClosed && !pinVerified) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center px-6">
        <Text style={{ fontSize: 64 }}>🔒</Text>
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-4 text-center">
          OS Encerrada
        </Text>
        <Text className="text-base text-gray-500 dark:text-slate-400 text-center mt-1">
          {order.vehicle.plate} — {order.vehicle.model}
        </Text>
        <Text className="text-sm text-gray-400 dark:text-slate-500 text-center mt-3 leading-5">
          Esta OS está encerrada.{'\n'}Somente o Supervisor pode acessar o conteúdo.
        </Text>

        <TouchableOpacity
          onPress={() => setShowUnlockPin(true)}
          activeOpacity={0.8}
          className="w-full mt-10 py-4 rounded-2xl bg-blue-600 items-center"
        >
          <Text className="text-white font-bold text-base">🔑 Entrar com PIN de Supervisor</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          className="w-full mt-3 py-4 rounded-2xl bg-slate-200 dark:bg-slate-800 items-center"
        >
          <Text className="text-gray-600 dark:text-slate-400 font-medium text-base">Voltar</Text>
        </TouchableOpacity>

        <PinModal
          visible={showUnlockPin}
          itemDescription={`Acessar OS encerrada: ${order.vehicle.plate}`}
          onAuthorized={() => { setPinVerified(true); setShowUnlockPin(false); }}
          onCancel={() => setShowUnlockPin(false)}
        />
      </View>
    );
  }

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
          </View>

          <View
            className={`px-3 py-1.5 rounded-full ${
              order.status === 'open'
                ? 'bg-green-100 dark:bg-green-900/30'
                : order.status === 'in_progress'
                ? 'bg-amber-100 dark:bg-amber-900/30'
                : 'bg-gray-100 dark:bg-slate-700'
            }`}
          >
            <Text
              className={`text-xs font-bold uppercase ${
                order.status === 'open'
                  ? 'text-green-700 dark:text-green-400'
                  : order.status === 'in_progress'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              {order.status === 'open'
                ? 'Aberta'
                : order.status === 'in_progress'
                ? 'Em andamento'
                : 'Encerrada'}
            </Text>
          </View>
        </View>

        {/* Banner somente-leitura */}
        {isClosed && (
          <View className="flex-row items-center gap-2 mt-3 px-3 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
            <Text style={{ fontSize: 14 }}>🔒</Text>
            <Text className="flex-1 text-xs text-gray-500 dark:text-slate-400">
              OS encerrada — somente leitura. Somente um administrador pode reabrir.
            </Text>
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
                <SearchResultItem item={item} onPress={handleAddCatalogItem} />
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
                      className="flex-1 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 items-center"
                    >
                      {changingStatus ? (
                        <ActivityIndicator size="small" color="#dc2626" />
                      ) : (
                        <Text className="text-sm font-semibold text-red-600 dark:text-red-400">
                          🔒 Fechar OS
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={handleReopenRequest}
                      disabled={changingStatus}
                      className="flex-1 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 items-center"
                    >
                      {changingStatus ? (
                        <ActivityIndicator size="small" color="#d97706" />
                      ) : (
                        <Text className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                          🔓 Reabrir OS
                        </Text>
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

      {/* Modal de preço total do serviço por item */}
      <ServicePriceModal
        visible={laborItem !== null}
        title={laborItem ? laborItem.description : 'Preço Total'}
        description={laborItem
          ? `Peça: ${currency(laborItem.total)} — Digite o preço total cobrado (peça + instalação)`
          : undefined}
        initialValue={laborItem
          ? (laborItem.total ?? 0) + (laborItem.laborPrice ?? 0)
          : 0}
        onConfirm={handleLaborConfirm}
        onCancel={() => setLaborItem(null)}
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
