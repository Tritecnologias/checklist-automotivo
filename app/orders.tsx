import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { Order } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  open:        'Aberta',
  in_progress: 'Em andamento',
  closed:      'Encerrada',
};
const STATUS_STYLE: Record<string, string> = {
  open:        'bg-green-100 dark:bg-green-900/30',
  in_progress: 'bg-amber-100 dark:bg-amber-900/30',
  closed:      'bg-gray-100 dark:bg-slate-700',
};
const STATUS_TEXT: Record<string, string> = {
  open:        'text-green-700 dark:text-green-400',
  in_progress: 'text-amber-700 dark:text-amber-400',
  closed:      'text-gray-500 dark:text-slate-400',
};

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function OrderCard({ order }: { order: Order }) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/order/${order.id}`);
  }, [order.id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      className="mx-4 mb-3 bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-xs font-mono text-gray-400 dark:text-slate-500">
            OS #{order.id.split('-')[0].toUpperCase()}
          </Text>
          <Text className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
            {order.vehicle.plate}
          </Text>
          <Text className="text-sm text-gray-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
            {order.vehicle.model} · {order.vehicle.mileage.toLocaleString('pt-BR')} km
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full ${STATUS_STYLE[order.status] ?? STATUS_STYLE.closed}`}>
          <Text className={`text-xs font-bold uppercase ${STATUS_TEXT[order.status] ?? STATUS_TEXT.closed}`}>
            {STATUS_LABEL[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
        <Text className="text-xs text-gray-400 dark:text-slate-500">
          {formatDate(order.createdAt as unknown as string)}
        </Text>
        <Text className="text-base font-bold text-green-600 dark:text-green-400">
          {currency(order.totalAmount)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const { data: orders, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['orders', debouncedSearch],
    queryFn: () => api.listOrders(debouncedSearch || undefined),
    staleTime: 30_000,
  });

  const handleClear = useCallback(() => {
    setSearch('');
  }, []);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-3 text-gray-500 dark:text-slate-400">Carregando OS…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
        <Text className="text-5xl mb-4">⚠️</Text>
        <Text className="text-lg font-bold text-gray-900 dark:text-white text-center">
          Erro ao carregar ordens
        </Text>
        <TouchableOpacity onPress={() => refetch()} className="mt-4 px-6 py-3 bg-blue-600 rounded-xl">
          <Text className="text-white font-semibold">Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isSearching = debouncedSearch.length >= 2;
  const count = orders?.length ?? 0;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Barra de busca por placa */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-3 gap-2">
          <Text className="text-base text-gray-400">🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por placa…"
            placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
            autoCapitalize="characters"
            autoCorrect={false}
            className="flex-1 py-3 text-sm text-gray-900 dark:text-white"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text className="text-gray-400 dark:text-slate-500 text-lg">✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={orders ?? []}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => <OrderCard order={item} />}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor="#3b82f6"
          />
        }
        ListEmptyComponent={
          <View className="items-center py-20 px-8">
            <Text style={{ fontSize: 56 }}>{isSearching ? '🔍' : '📋'}</Text>
            <Text className="text-gray-500 dark:text-slate-400 text-base text-center mt-4">
              {isSearching
                ? `Nenhuma OS encontrada para "${search}"`
                : 'Nenhuma OS encontrada.\nCrie uma nova na tela inicial.'}
            </Text>
          </View>
        }
        ListHeaderComponent={
          <Text className="px-4 pb-3 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
            {isSearching
              ? `${count} ${count === 1 ? 'resultado' : 'resultados'} para "${debouncedSearch}"`
              : `${count} ${count === 1 ? 'ordem' : 'ordens'}`}
          </Text>
        }
      />
    </View>
  );
}
