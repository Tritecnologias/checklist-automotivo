import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';
import { useColorScheme } from 'nativewind';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  loading = false,
  placeholder = 'Buscar peça ou serviço…',
}: SearchBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View className="flex-row items-center bg-gray-100 dark:bg-slate-800 rounded-2xl px-4 py-3 mx-4 my-2">
      {/* Ícone de busca (usando texto Unicode para não depender de lib extra) */}
      <View className="mr-3">
        <TextInput
          editable={false}
          value="🔍"
          className="text-base"
          style={{ fontSize: 16 }}
        />
      </View>

      <TextInput
        className="flex-1 text-base text-gray-900 dark:text-white"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
      />

      {loading ? (
        <ActivityIndicator
          size="small"
          color={isDark ? '#60a5fa' : '#3b82f6'}
          className="ml-2"
        />
      ) : value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="ml-2"
        >
          <TextInput
            editable={false}
            value="✕"
            style={{ fontSize: 16, color: isDark ? '#64748b' : '#9ca3af' }}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
