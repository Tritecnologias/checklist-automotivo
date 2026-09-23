import { Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { OrderItem } from '@/types';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface ItemRowProps {
  item: OrderItem;
  onDeleteRequest: (item: OrderItem) => void;
  onQuantityChange: (item: OrderItem, delta: 1 | -1) => void;
  onLaborRequest: (item: OrderItem) => void;
  /** Quando true, desabilita todas as ações de edição (OS encerrada) */
  readOnly?: boolean;
}

export function ItemRow({ item, onDeleteRequest, onQuantityChange, onLaborRequest, readOnly = false }: ItemRowProps) {
  const handleDelete = () => {
    if (readOnly) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDeleteRequest(item);
  };

  const handleIncrease = () => {
    if (readOnly) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onQuantityChange(item, 1);
  };

  const handleDecrease = () => {
    if (readOnly) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onQuantityChange(item, -1);
  };

  const handleLabor = () => {
    if (readOnly) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLaborRequest(item);
  };

  return (
    <View className="bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
      {/* Linha principal */}
      <View className="flex-row items-center px-4 pt-3 pb-2">
        {/* Indicador de tipo */}
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
          <View className="flex-row items-center mt-1 gap-1.5">
            <Text className="text-xs text-gray-500 dark:text-slate-400">
              Peça: {currency(item.unitPrice)} / un
            </Text>
            {item.instalacaoSigla && (
              <View className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40">
                <Text className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  {item.instalacaoSigla}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Controle de quantidade */}
        <View className={`flex-row items-center mx-3 ${readOnly ? 'opacity-30' : ''}`}>
          <TouchableOpacity
            onPress={handleDecrease}
            disabled={readOnly}
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
            disabled={readOnly}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center"
          >
            <Text className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-none">
              +
            </Text>
          </TouchableOpacity>
        </View>

        {/* Total peça + excluir */}
        <View className="items-end">
          <Text className="text-sm font-bold text-amber-600 dark:text-amber-400">
            {currency(item.total)}
          </Text>
          {!readOnly && (
            <TouchableOpacity
              onPress={handleDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="mt-1 p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20"
            >
              <Text className="text-xs text-red-500 dark:text-red-400 font-medium">
                Excluir
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Linha de preço total do serviço (peça + instalação) */}
      <TouchableOpacity
        onPress={handleLabor}
        disabled={readOnly}
        activeOpacity={readOnly ? 1 : 0.7}
        className={`flex-row items-center justify-between mx-4 mb-3 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 ${readOnly ? 'opacity-50' : ''}`}
      >
        <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">
          {readOnly ? '🔧 Total c/ instalação' : '🔧 Total c/ instalação ✏️'}
        </Text>
        {(item.laborPrice ?? 0) > 0 ? (
          <Text className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {currency(item.total + item.laborPrice)}
          </Text>
        ) : (
          <Text className="text-xs text-gray-400 dark:text-slate-500">
            {readOnly ? '—' : 'Toque para definir'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
