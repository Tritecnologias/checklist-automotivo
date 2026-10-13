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
  onMechanicRequest?: (item: OrderItem) => void;
  /** Quando true, desabilita todas as ações de edição (OS encerrada) */
  readOnly?: boolean;
}

export function ItemRow({
  item,
  onDeleteRequest,
  onQuantityChange,
  onLaborRequest,
  onMechanicRequest,
  readOnly = false,
}: ItemRowProps) {
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

  const handleMechanic = () => {
    if (readOnly || !onMechanicRequest) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMechanicRequest(item);
  };

  const isService = item.type === 'service';

  return (
    <View className="bg-white dark:bg-slate-900 rounded-2xl mb-2.5 p-3.5 border border-gray-100 dark:border-slate-800 shadow-sm">
      {/* Topo: Código + Badges (Serviço, Estoque, Instalação) + Botão Excluir */}
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center gap-1.5 flex-wrap flex-1 mr-2">
          {item.code ? (
            <Text className="text-[11px] font-mono font-bold text-gray-400 dark:text-slate-500">
              {item.code}
            </Text>
          ) : null}

          {isService ? (
            <View className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60">
              <Text className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                Serviço
              </Text>
            </View>
          ) : null}

          {item.instalacaoSigla ? (
            <View className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60">
              <Text className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                {item.instalacaoSigla}
              </Text>
            </View>
          ) : null}

          {!isService && item.controlaEstoque === false ? (
            <View className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60">
              <Text className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                ∞ Livre
              </Text>
            </View>
          ) : !isService && item.stock !== null && item.stock !== undefined ? (
            item.stock <= 0 ? (
              <View className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60">
                <Text className="text-[10px] font-bold text-red-600 dark:text-red-400">
                  ⚠️ Sem estoque (0)
                </Text>
              </View>
            ) : item.quantity > item.stock ? (
              <View className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60">
                <Text className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  ⚠️ Qtd &gt; Estq ({item.stock})
                </Text>
              </View>
            ) : (
              <View className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                <Text className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Estq: {item.stock}
                </Text>
              </View>
            )
          ) : null}
        </View>

        {!readOnly && (
          <TouchableOpacity
            onPress={handleDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/30"
          >
            <Text style={{ fontSize: 13 }}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Descrição do Produto / Serviço */}
      <Text
        className="text-sm font-bold text-gray-900 dark:text-white leading-snug mb-2"
        numberOfLines={2}
      >
        {item.description}
      </Text>

      {/* Técnico / Mecânico atribuído ao item */}
      <TouchableOpacity
        onPress={handleMechanic}
        disabled={readOnly || !onMechanicRequest}
        activeOpacity={readOnly || !onMechanicRequest ? 1 : 0.7}
        className="flex-row items-center justify-between py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800 mb-2.5"
      >
        <View className="flex-row items-center gap-1.5 flex-1 mr-2">
          <Text style={{ fontSize: 12 }}>🔧</Text>
          <Text className="text-[11px] text-gray-500 dark:text-slate-400">
            Técnico:
          </Text>
          <Text
            className="text-xs font-bold text-gray-800 dark:text-slate-200 flex-1"
            numberOfLines={1}
          >
            {item.mecanicoNome || 'Padrão da OS'}
          </Text>
        </View>

        {item.executantes && item.executantes.length > 1 ? (
          <View className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800">
            <Text className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              👥 {item.executantes.length} Exec.
            </Text>
          </View>
        ) : !readOnly && onMechanicRequest ? (
          <Text className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
            Trocar ▾
          </Text>
        ) : null}
      </TouchableOpacity>

      {/* Linha de Quantidade e Valores */}
      <View className="flex-row items-center justify-between pt-1 border-t border-gray-100 dark:border-slate-800/80">
        {/* Controle de quantidade */}
        <View className={`flex-row items-center bg-gray-100 dark:bg-slate-800 rounded-xl p-0.5 ${readOnly ? 'opacity-40' : ''}`}>
          <TouchableOpacity
            onPress={handleDecrease}
            disabled={readOnly}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            className="w-7 h-7 rounded-lg items-center justify-center bg-white dark:bg-slate-700 shadow-sm"
          >
            <Text className="text-sm font-bold text-gray-700 dark:text-slate-200">
              −
            </Text>
          </TouchableOpacity>

          <Text className="w-7 text-center text-xs font-extrabold text-gray-900 dark:text-white">
            {item.quantity}
          </Text>

          <TouchableOpacity
            onPress={handleIncrease}
            disabled={readOnly}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            className="w-7 h-7 rounded-lg items-center justify-center bg-blue-600 shadow-sm"
          >
            <Text className="text-sm font-bold text-white">
              +
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preço Unitário & Total */}
        <View className="items-center px-2">
          <Text className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-500">
            Unitário
          </Text>
          <Text className="text-xs font-semibold text-gray-600 dark:text-slate-300 font-mono">
            {currency(item.unitPrice)}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-500">
            {isService ? 'Total Serviço' : 'Total Peça'}
          </Text>
          <Text className="text-xs font-extrabold text-amber-600 dark:text-amber-400 font-mono">
            {currency(item.total)}
          </Text>
        </View>
      </View>

      {/* Linha separada de Mão de Obra (M.O.) com lápis para editar */}
      <View className="mt-2.5 pt-2 border-t border-dashed border-gray-100 dark:border-slate-800 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs text-gray-500 dark:text-slate-400 font-medium">
            Mão de Obra:
          </Text>
          <Text className={`text-xs font-bold font-mono ${(item.laborPrice ?? 0) > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}>
            {(item.laborPrice ?? 0) > 0 ? currency(item.laborPrice) : 'R$ 0,00'}
          </Text>
        </View>

        {!readOnly && (
          <TouchableOpacity
            onPress={handleLabor}
            activeOpacity={0.7}
            className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex-row items-center gap-1"
          >
            <Text className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
              {(item.laborPrice ?? 0) > 0 ? 'Editar M.O.' : 'Add M.O.'} ✏️
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
