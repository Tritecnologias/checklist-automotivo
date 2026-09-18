import { Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { OrderItem } from '@/types';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface ItemRowProps {
  item: OrderItem;
  /** Chamado ao tentar excluir — abre modal de PIN no pai */
  onDeleteRequest: (item: OrderItem) => void;
  /** Chamado para aumentar/diminuir quantidade; diminuir também pede PIN */
  onQuantityChange: (item: OrderItem, delta: 1 | -1) => void;
}

export function ItemRow({ item, onDeleteRequest, onQuantityChange }: ItemRowProps) {
  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDeleteRequest(item);
  };

  const handleIncrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onQuantityChange(item, 1);
  };

  const handleDecrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onQuantityChange(item, -1);
  };

  return (
    <View className="flex-row items-center bg-white dark:bg-slate-800 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
      {/* Tipo */}
      <View
        className={`w-1 self-stretch rounded-full mr-3 ${
          item.type === 'part' ? 'bg-amber-400' : 'bg-blue-400'
        }`}
      />

      {/* Informações */}
      <View className="flex-1 min-w-0">
        <Text className="text-xs font-mono text-gray-400 dark:text-slate-500">
          {item.code}
        </Text>
        <Text
          className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5"
          numberOfLines={2}
        >
          {item.description}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-slate-400 mt-1">
          {currency(item.unitPrice)} / un
        </Text>
      </View>

      {/* Controle de quantidade */}
      <View className="flex-row items-center mx-3">
        <TouchableOpacity
          onPress={handleDecrease}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 items-center justify-center"
        >
          <Text className="text-lg font-bold text-gray-600 dark:text-slate-300 leading-none">
            −
          </Text>
        </TouchableOpacity>

        <Text className="w-8 text-center text-sm font-bold text-gray-900 dark:text-white">
          {item.quantity}
        </Text>

        <TouchableOpacity
          onPress={handleIncrease}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center"
        >
          <Text className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-none">
            +
          </Text>
        </TouchableOpacity>
      </View>

      {/* Total + botão excluir */}
      <View className="items-end">
        <Text className="text-sm font-bold text-green-600 dark:text-green-400">
          {currency(item.total)}
        </Text>
        <TouchableOpacity
          onPress={handleDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="mt-1 p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20"
        >
          <Text className="text-xs text-red-500 dark:text-red-400 font-medium">
            Excluir
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
