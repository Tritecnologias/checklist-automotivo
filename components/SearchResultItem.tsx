import { Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { CatalogItem } from '@/types';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface SearchResultItemProps {
  item: CatalogItem;
  onPress: (item: CatalogItem) => void;
}

export function SearchResultItem({ item, onPress }: SearchResultItemProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800"
    >
      {/* Badge de tipo */}
      <View
        className={`px-2 py-0.5 rounded-md mr-3 ${
          item.type === 'part'
            ? 'bg-amber-100 dark:bg-amber-900/40'
            : 'bg-blue-100 dark:bg-blue-900/40'
        }`}
      >
        <Text
          className={`text-xs font-semibold ${
            item.type === 'part'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-blue-700 dark:text-blue-300'
          }`}
        >
          {item.type === 'part' ? 'PEÇA' : 'MO'}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-xs font-mono text-gray-400 dark:text-slate-500">
          {item.code}
        </Text>
        <Text
          className="text-sm font-medium text-gray-900 dark:text-white mt-0.5"
          numberOfLines={1}
        >
          {item.description}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-0.5 flex-wrap">
          {item.stock !== undefined && (
            <Text className="text-xs text-gray-400 dark:text-slate-500">
              Estoque: {item.stock} un
            </Text>
          )}
          {item.instalacoes.length > 0 && (
            <Text className="text-[10px] font-semibold text-blue-500 dark:text-blue-400">
              🔩 {item.instalacoes.map(i => i.sigla).join(' / ')}
            </Text>
          )}
        </View>
      </View>

      <Text className="text-sm font-bold text-green-600 dark:text-green-400 ml-3">
        {currency(item.unitPrice)}
      </Text>
    </TouchableOpacity>
  );
}
