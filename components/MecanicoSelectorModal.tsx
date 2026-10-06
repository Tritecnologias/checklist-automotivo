import { useState } from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Mecanico } from '@/types';

interface MecanicoSelectorModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  mecanicos: Mecanico[];
  selectedId: number | null;
  allowClear?: boolean;
  clearLabel?: string;
  onSelect: (mecanico: Mecanico | null) => void;
  onClose: () => void;
}

export function MecanicoSelectorModal({
  visible,
  title,
  subtitle,
  mecanicos,
  selectedId,
  allowClear = true,
  clearLabel = 'Nenhum / Remover seleção',
  onSelect,
  onClose,
}: MecanicoSelectorModalProps) {
  const [search, setSearch] = useState('');

  const filtered = mecanicos.filter((m) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const nomeMatch = m.nome.toLowerCase().includes(term);
    const apelidoMatch = m.apelido ? m.apelido.toLowerCase().includes(term) : false;
    return nomeMatch || apelidoMatch;
  });

  function handlePick(m: Mecanico | null) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(m);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/70 items-center justify-center p-4">
        <View className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md max-h-[85%] p-5 shadow-2xl flex-col">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
            <View className="flex-1 mr-2">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                {title}
              </Text>
              {subtitle ? (
                <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 items-center justify-center"
            >
              <Text className="text-gray-500 dark:text-slate-400 font-bold text-sm">✕</Text>
            </TouchableOpacity>
          </View>

          {/* Busca rápida */}
          {mecanicos.length > 5 && (
            <View className="mt-3">
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por nome ou apelido…"
                placeholderTextColor="#94a3b8"
                className="bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm border border-gray-200 dark:border-slate-700"
              />
            </View>
          )}

          {/* Lista de colaboradores */}
          <ScrollView className="mt-3 flex-grow" showsVerticalScrollIndicator={false}>
            {allowClear && (
              <TouchableOpacity
                onPress={() => handlePick(null)}
                activeOpacity={0.7}
                className={`flex-row items-center p-3 mb-2 rounded-2xl border ${
                  selectedId === null
                    ? 'border-red-400 bg-red-50 dark:bg-red-950/40'
                    : 'border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40'
                }`}
              >
                <View className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 items-center justify-center mr-3">
                  <Text style={{ fontSize: 16 }}>🚫</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                    {clearLabel}
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500">
                    Não vincular responsável nesta abertura
                  </Text>
                </View>
                {selectedId === null && (
                  <Text className="text-red-500 font-bold text-sm">✓</Text>
                )}
              </TouchableOpacity>
            )}

            {filtered.map((m) => {
              const isSelected = selectedId === m.id;
              const initials = m.nome
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0].toUpperCase())
                .join('');

              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => handlePick(m)}
                  activeOpacity={0.7}
                  className={`flex-row items-center p-3 mb-2 rounded-2xl border ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800/70'
                  }`}
                >
                  {/* Avatar com iniciais */}
                  <View
                    className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                      isSelected
                        ? 'bg-blue-600'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {initials || '🔧'}
                    </Text>
                  </View>

                  {/* Nome e detalhes */}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text
                        className={`text-sm font-bold ${
                          isSelected
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {m.nome}
                      </Text>
                      {m.apelido && m.apelido !== m.nome ? (
                        <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                          ({m.apelido})
                        </Text>
                      ) : null}
                    </View>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-xs text-gray-400 dark:text-slate-500">
                        {m.is_auxiliar ? 'Auxiliar / Apoio' : 'Mecânico / Técnico'}
                      </Text>
                    </View>
                  </View>

                  {/* Indicador de Seleção */}
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-600 items-center justify-center ml-2">
                      <Text className="text-white text-xs font-bold">✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {filtered.length === 0 && (
              <View className="py-8 items-center">
                <Text className="text-sm text-gray-400 dark:text-slate-500">
                  Nenhum colaborador encontrado
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Botão Fechar */}
          <TouchableOpacity
            onPress={onClose}
            className="mt-3 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800"
          >
            <Text className="text-center font-semibold text-gray-700 dark:text-slate-300 text-sm">
              Fechar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
