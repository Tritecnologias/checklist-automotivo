import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { OrderItem } from '@/types';

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface ItemPriceModalProps {
  visible: boolean;
  item: OrderItem | null;
  onConfirm: (data: { itemId: string; total: number; unitPrice: number }) => void;
  onCancel: () => void;
}

export function ItemPriceModal({
  visible,
  item,
  onConfirm,
  onCancel,
}: ItemPriceModalProps) {
  const [totalStr, setTotalStr] = useState('');
  const [unitStr, setUnitStr] = useState('');

  const qty = item?.quantity ?? 1;
  const isService = item?.type === 'service';

  useEffect(() => {
    if (visible && item) {
      const initialTotal = item.total ?? (item.unitPrice * qty);
      const initialUnit = item.unitPrice ?? (qty > 0 ? initialTotal / qty : 0);
      setTotalStr(initialTotal.toFixed(2).replace('.', ','));
      setUnitStr(initialUnit.toFixed(2).replace('.', ','));
    }
  }, [visible, item, qty]);

  function parseVal(text: string): number {
    const clean = text.replace(/[^\d,\.]/g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  }

  function handleTotalChange(text: string) {
    setTotalStr(text);
    const total = parseVal(text);
    const unit = qty > 0 ? total / qty : total;
    setUnitStr(unit.toFixed(2).replace('.', ','));
  }

  function handleUnitChange(text: string) {
    setUnitStr(text);
    const unit = parseVal(text);
    const total = unit * qty;
    setTotalStr(total.toFixed(2).replace('.', ','));
  }

  function handleResetOriginal() {
    if (!item) return;
    const initialUnit = item.unitPrice ?? 0;
    const initialTotal = initialUnit * qty;
    setTotalStr(initialTotal.toFixed(2).replace('.', ','));
    setUnitStr(initialUnit.toFixed(2).replace('.', ','));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleConfirm() {
    if (!item) return;
    const total = parseVal(totalStr);
    const unitPrice = qty > 0 ? total / qty : total;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm({
      itemId: item.id,
      total: Number(total.toFixed(2)),
      unitPrice: Number(unitPrice.toFixed(4)),
    });
  }

  const currentTotal = parseVal(totalStr);
  const isValid = currentTotal >= 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 bg-black/75 items-center justify-center px-4"
      >
        <View className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-5 shadow-2xl border border-gray-100 dark:border-slate-800">
          
          {/* Header */}
          <View className="items-center mb-3">
            <View className="w-10 h-10 rounded-2xl bg-amber-500/15 items-center justify-center mb-2 border border-amber-500/20">
              <Text style={{ fontSize: 20 }}>💰</Text>
            </View>
            <Text className="text-lg font-black text-gray-900 dark:text-white text-center">
              {isService ? 'Editar Total do Serviço' : 'Editar Total da Peça'}
            </Text>
            {item && (
              <Text
                className="text-xs text-gray-500 dark:text-slate-400 text-center mt-1 font-medium px-2"
                numberOfLines={2}
              >
                {item.code ? `[${item.code}] ` : ''}{item.description}
              </Text>
            )}
          </View>

          {/* Badge de Quantidade */}
          <View className="flex-row items-center justify-center gap-2 mb-4">
            <View className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Quantidade: <Text className="text-amber-600 dark:text-amber-400 font-extrabold">{qty} {qty === 1 ? 'unidade' : 'unidades'}</Text>
              </Text>
            </View>
          </View>

          {/* Input Principal: Valor Total */}
          <View className="mb-3">
            <View className="flex-row items-center justify-between mb-1.5 px-1">
              <Text className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Valor Total da Peça (R$)
              </Text>
              <Text className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                Cobrado nesta OS
              </Text>
            </View>
            <View className="relative">
              <TextInput
                value={totalStr}
                onChangeText={handleTotalChange}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor="#9ca3af"
                selectTextOnFocus
                className="text-center text-3xl font-black text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-800/90 border border-amber-500/40 focus:border-amber-500 rounded-2xl py-3 px-4 shadow-sm"
              />
            </View>
          </View>

          {/* Input Secundário: Valor Unitário correspondente */}
          <View className="mb-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                Valor Unitário (por unidade):
              </Text>
              <TouchableOpacity onPress={handleResetOriginal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                  Restaurar Original
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-bold text-gray-400 dark:text-slate-500">R$</Text>
              <TextInput
                value={unitStr}
                onChangeText={handleUnitChange}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor="#9ca3af"
                selectTextOnFocus
                className="flex-1 text-base font-bold text-gray-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-1.5 px-3"
              />
            </View>
          </View>

          {/* Botões de Ação */}
          <View className="space-y-2">
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!isValid}
              activeOpacity={0.8}
              className={`py-3.5 rounded-2xl items-center shadow-md ${
                isValid
                  ? 'bg-amber-600 dark:bg-amber-500'
                  : 'bg-gray-200 dark:bg-slate-800'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  isValid ? 'text-white' : 'text-gray-400 dark:text-slate-600'
                }`}
              >
                Salvar Novo Total ({currency(currentTotal)})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.7}
              className="mt-2 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 items-center"
            >
              <Text className="text-xs font-semibold text-gray-600 dark:text-slate-400">
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
