import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { lookupCep } from '@/lib/cep';
import type { OrderClient } from '@/types';

interface ClientEditModalProps {
  visible: boolean;
  client?: OrderClient | null;
  onSave: (data: {
    name: string;
    phone: string;
    document?: string;
    cep?: string;
    address?: string;
  }) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export function ClientEditModal({
  visible,
  client,
  onSave,
  onClose,
  isSaving = false,
}: ClientEditModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [cep, setCep] = useState('');
  const [address, setAddress] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && client) {
      setName(client.name || '');
      setPhone(client.phone || '');
      setDocument(client.document || '');
      setCep(client.cep || '');
      setAddress(client.address || '');
      setError('');
    }
  }, [visible, client]);

  const handleCepSearch = async (cepValue: string) => {
    const clean = cepValue.replace(/\D/g, '');
    if (clean.length === 8) {
      setLoadingCep(true);
      setError('');
      try {
        const res = await lookupCep(clean);
        if (res && res.formattedAddress) {
          setAddress(res.formattedAddress);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch {
        // Ignora silenciosamente
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Nome do cliente é obrigatório.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 8) {
      setError('Telefone válido é obrigatório (mínimo 8 dígitos).');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      document: document.trim() || undefined,
      cep: cep.trim() || undefined,
      address: address.trim() || undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/75 items-center justify-center p-4">
        <View className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md max-h-[90%] p-6 shadow-2xl flex-col border border-gray-100 dark:border-slate-800">
          {/* Cabeçalho */}
          <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
            <View className="flex-1">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                👤 Editar Dados do Cliente
              </Text>
              <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Atualize as informações de contato desta OS
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSaving}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 items-center justify-center"
            >
              <Text className="text-gray-500 dark:text-slate-400 font-bold text-sm">✕</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
              <Text className="text-xs text-red-600 dark:text-red-400 font-medium">
                ⚠️ {error}
              </Text>
            </View>
          ) : null}

          {/* Formulário */}
          <ScrollView className="mt-3" showsVerticalScrollIndicator={false}>
            {/* Nome */}
            <View className="mb-3">
              <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                Nome do Cliente *
              </Text>
              <TextInput
                value={name}
                onChangeText={(t) => { setName(t); setError(''); }}
                placeholder="Ex: João da Silva"
                placeholderTextColor="#94a3b8"
                className="bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm border border-gray-200 dark:border-slate-700"
              />
            </View>

            {/* Telefone */}
            <View className="mb-3">
              <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                Telefone / WhatsApp *
              </Text>
              <TextInput
                value={phone}
                onChangeText={(t) => { setPhone(t); setError(''); }}
                placeholder="(00) 00000-0000"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                className="bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm font-mono border border-gray-200 dark:border-slate-700"
              />
            </View>

            {/* CPF / CNPJ */}
            <View className="mb-3">
              <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                CPF ou CNPJ
              </Text>
              <TextInput
                value={document}
                onChangeText={setDocument}
                placeholder="000.000.000-00"
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
                className="bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm font-mono border border-gray-200 dark:border-slate-700"
              />
            </View>

            {/* CEP */}
            <View className="mb-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300">
                  CEP
                </Text>
                {loadingCep && (
                  <View className="flex-row items-center gap-1">
                    <ActivityIndicator size="small" color="#3b82f6" />
                    <Text className="text-[11px] text-blue-500 font-medium">Buscando endereço…</Text>
                  </View>
                )}
              </View>
              <View className="relative">
                <TextInput
                  value={cep}
                  onChangeText={(t) => {
                    setCep(t);
                    if (t.replace(/\D/g, '').length === 8) {
                      handleCepSearch(t);
                    }
                  }}
                  onBlur={() => handleCepSearch(cep)}
                  placeholder="00000-000"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  maxLength={9}
                  className="bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm font-mono border border-gray-200 dark:border-slate-700"
                />
              </View>
            </View>

            {/* Endereço Completo */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">
                Endereço Completo (Rua, Número, Bairro, Cidade - UF)
              </Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Rua, Número, Bairro, Cidade - UF"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={2}
                className="bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm border border-gray-200 dark:border-slate-700"
              />
            </View>
          </ScrollView>

          {/* Botões */}
          <View className="flex-row gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
            <TouchableOpacity
              onPress={onClose}
              disabled={isSaving}
              className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 items-center justify-center"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                Cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSaving}
              className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 items-center justify-center shadow-sm"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-sm font-bold text-white">
                  Salvar Dados
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
