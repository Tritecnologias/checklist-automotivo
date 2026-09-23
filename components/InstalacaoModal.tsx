import { Modal, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import type { InstItem } from '@/types';

interface InstalacaoModalProps {
  visible: boolean;
  productDescription: string;
  instalacoes: InstItem[];
  onSelect: (id: number) => void;
  onCancel: () => void;
}

export function InstalacaoModal({
  visible,
  productDescription,
  instalacoes,
  onSelect,
  onCancel,
}: InstalacaoModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View className="flex-1 bg-black/70 items-center justify-center px-5">
        <View className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 shadow-2xl">
          <Text className="text-xl font-bold text-gray-900 dark:text-white text-center">
            Selecione a Instalação
          </Text>
          <Text
            className="text-sm text-gray-500 dark:text-slate-400 text-center mt-2"
            numberOfLines={2}
          >
            {productDescription}
          </Text>

          <Text className="text-xs text-red-500 dark:text-red-400 text-center mt-1 font-medium">
            Obrigatório
          </Text>

          <ScrollView className="mt-5 max-h-64">
            <View className="flex-row flex-wrap gap-3 justify-center">
              {instalacoes.map(inst => (
                <TouchableOpacity
                  key={inst.id}
                  onPress={() => onSelect(inst.id)}
                  activeOpacity={0.75}
                  className="bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 items-center min-w-[110px]"
                >
                  <Text className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                    {inst.sigla}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-slate-400 mt-1 text-center">
                    {inst.nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            onPress={onCancel}
            className="mt-5 py-3 rounded-2xl border border-gray-200 dark:border-slate-700"
          >
            <Text className="text-center font-semibold text-gray-600 dark:text-slate-300">
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
