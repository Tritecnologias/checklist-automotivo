import { useEffect, useState } from 'react';
import {
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface ServicePriceModalProps {
  visible: boolean;
  title?: string;
  description?: string;
  initialValue?: number;
  onConfirm: (price: number) => void;
  onCancel: () => void;
}

export function ServicePriceModal({
  visible,
  title = 'Mão de Obra',
  description,
  initialValue = 0,
  onConfirm,
  onCancel,
}: ServicePriceModalProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) {
      setValue(initialValue > 0 ? initialValue.toFixed(2).replace('.', ',') : '');
    }
  }, [visible, initialValue]);

  function parsePrice(text: string): number {
    const n = parseFloat(text.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function handleConfirm() {
    const price = parsePrice(value);
    if (price <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(price);
  }

  const valid = parsePrice(value) > 0;

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
            {title}
          </Text>

          {description ? (
            <Text
              className="text-sm text-gray-500 dark:text-slate-400 text-center mt-2"
              numberOfLines={2}
            >
              {description}
            </Text>
          ) : null}

          <View className="mt-6 mb-4">
            <Text className="text-xs text-gray-400 dark:text-slate-500 mb-2 text-center">
              Valor cobrado (R$)
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#9ca3af"
              selectTextOnFocus
              className="text-center text-3xl font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl py-4 px-6"
            />
          </View>

          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!valid}
            activeOpacity={0.8}
            className={`py-4 rounded-2xl items-center ${
              valid ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-700'
            }`}
          >
            <Text
              className={`text-base font-bold ${
                valid ? 'text-white' : 'text-gray-400 dark:text-slate-500'
              }`}
            >
              Confirmar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCancel}
            className="mt-3 py-3 rounded-2xl border border-gray-200 dark:border-slate-700"
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
