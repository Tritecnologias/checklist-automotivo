import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { lookupCep, formatCep, formatCpfCnpj, formatPhone } from '@/lib/cep';
import type { Order, OrderAdminUser } from '@/types';

interface FinalizarOrderModalProps {
  visible: boolean;
  order: Order;
  onClose: () => void;
  onSuccess: (updated: Order, sendToPdv: boolean) => void;
}

export function FinalizarOrderModal({
  visible,
  order,
  onClose,
  onSuccess,
}: FinalizarOrderModalProps) {
  const { user: currentUser } = useAuth();
  const { height: screenHeight } = useWindowDimensions();

  // Estados dos dados do cliente
  const [clientName, setClientName] = useState('');
  const [clientDoc, setClientDoc] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCep, setClientCep] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);

  // Estados de autorização do administrador
  const [selectedAdminId, setSelectedAdminId] = useState<number | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordVisible, setAdminPasswordVisible] = useState(false);
  const [adminPickerVisible, setAdminPickerVisible] = useState(false);

  // Estados de controle e envio
  const [error, setError] = useState('');
  const [submittingAction, setSubmittingAction] = useState<'close' | 'pdv' | null>(null);

  // Buscar administradores ativos para o tenant da OS
  const { data: administradores = [], isLoading: loadingAdmins } = useQuery<OrderAdminUser[]>({
    queryKey: ['administradores', order?.tenantId],
    queryFn: () => api.getAdministradores(order?.tenantId),
    enabled: visible,
  });

  const isCurrentUserAdmin =
    currentUser?.role === 'owner' ||
    currentUser?.role === 'manager' ||
    currentUser?.role === 'admin';

  // Inicializa dados da OS ao abrir o modal
  useEffect(() => {
    if (visible && order) {
      setClientName(order.client?.name || '');
      setClientDoc(order.client?.document ? formatCpfCnpj(order.client.document) : '');
      setClientPhone(order.client?.phone ? formatPhone(order.client.phone) : '');
      setClientCep(order.client?.cep ? formatCep(order.client.cep) : '');
      setClientAddress(order.client?.address || '');
      setAdminPassword('');
      setAdminPasswordVisible(false);
      setError('');
      setSubmittingAction(null);
      setAdminPickerVisible(false);

      // Pré-seleciona administrador: usuário logado se for admin/gerente, senão primeiro da lista
      if (isCurrentUserAdmin && currentUser?.id) {
        setSelectedAdminId(currentUser.id);
      } else if (administradores.length > 0) {
        setSelectedAdminId(administradores[0].id);
      } else {
        setSelectedAdminId(null);
      }
    }
  }, [visible, order, currentUser, isCurrentUserAdmin]);

  // Se os administradores carregarem depois e ainda não houver seleção
  useEffect(() => {
    if (visible && !selectedAdminId && administradores.length > 0) {
      if (isCurrentUserAdmin && currentUser?.id) {
        const found = administradores.find((a) => a.id === currentUser.id);
        setSelectedAdminId(found ? found.id : administradores[0].id);
      } else {
        setSelectedAdminId(administradores[0].id);
      }
    }
  }, [administradores, visible, selectedAdminId, currentUser, isCurrentUserAdmin]);

  // Busca automática de endereço por CEP
  const handleCepChange = async (val: string) => {
    const formatted = formatCep(val);
    setClientCep(formatted);
    const clean = formatted.replace(/\D/g, '');

    if (clean.length === 8) {
      setLoadingCep(true);
      setError('');
      try {
        const res = await lookupCep(clean);
        if (res?.formattedAddress) {
          setClientAddress(res.formattedAddress);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch (err) {
        console.warn('Erro ao consultar CEP:', err);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const selectedAdmin = administradores.find((a) => a.id === selectedAdminId) ||
    (isCurrentUserAdmin && currentUser?.id === selectedAdminId
      ? {
          id: currentUser.id,
          nome: currentUser.nome,
          email: currentUser.email,
          role: currentUser.role,
          roleLabel: currentUser.role === 'owner' ? 'Proprietário / Super Admin' : 'Gerente / Administrador',
        }
      : null);

  const handleSubmit = async (sendToPdv: boolean) => {
    const name = clientName.trim();
    const doc = clientDoc.trim();
    const phone = clientPhone.trim();
    const cep = clientCep.trim();
    const address = clientAddress.trim();

    if (!name || name.length < 2) {
      setError('Informe o nome completo do cliente.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const cleanDoc = doc.replace(/\D/g, '');
    if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      setError('O CPF deve conter 11 dígitos ou CNPJ 14 dígitos.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      setError('Informe um telefone ou WhatsApp válido com DDD.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setError('Informe um CEP válido com 8 dígitos.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!address || address.length < 3) {
      setError('Informe o endereço completo do cliente.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!selectedAdminId) {
      setError('Selecione o administrador responsável para autorizar a finalização.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!adminPassword.trim()) {
      setError('Informe a senha do administrador para autorizar a finalização.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setError('');
    setSubmittingAction(sendToPdv ? 'pdv' : 'close');

    try {
      const updated = await api.finalizarOrder(order.id, {
        adminPassword: adminPassword.trim(),
        adminUserId: selectedAdminId,
        client: {
          name,
          document: doc,
          phone,
          cep,
          address,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess(updated, sendToPdv);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message || 'Erro ao finalizar Ordem de Serviço.');
    } finally {
      setSubmittingAction(null);
    }
  };

  const isSubmitting = submittingAction !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isSubmitting ? undefined : onClose}
    >
      <View className="flex-1 bg-black/80 items-center justify-center p-2 sm:p-4">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ height: Math.min(screenHeight * 0.92, 750), width: '100%', maxWidth: 560 }}
          className="bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl flex-col overflow-hidden"
        >
          {/* Cabeçalho */}
          <View className="flex-row items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
            <View className="flex-row items-center gap-3 flex-1">
              <View className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 items-center justify-center">
                <Text style={{ fontSize: 18 }}>🔒</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white leading-tight">
                  Finalizar Ordem de Serviço
                </Text>
                <Text className="text-xs text-slate-400 font-mono mt-0.5" numberOfLines={1}>
                  OS #{order.id.split('-')[0].toUpperCase()} • {order.vehicle?.plate} ({order.vehicle?.model})
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSubmitting}
              className="w-8 h-8 rounded-full bg-slate-800 items-center justify-center ml-2"
            >
              <Text className="text-slate-400 font-bold text-sm">✕</Text>
            </TouchableOpacity>
          </View>

          {/* Conteúdo com rolagem */}
          <ScrollView
            className="flex-1 p-4"
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Banner de Aviso */}
            <View className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5 mb-4">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Text style={{ fontSize: 13 }}>⚠️</Text>
                <Text className="font-bold text-amber-300 text-xs flex-1">
                  Confirmação Cadastral e Autorização Administrativa
                </Text>
              </View>
              <Text className="text-slate-300 text-xs leading-relaxed">
                Ao finalizar a OS, os dados do cliente (CPF/CNPJ, Telefone e Endereço) são confirmados para emissão e cobrança no PDV. A finalização exige autenticação por senha de administrador.
              </Text>
            </View>

            {/* Mensagem de Erro */}
            {error ? (
              <View className="bg-red-950/70 border border-red-800 rounded-xl p-3 mb-4 flex-row items-start gap-2">
                <Text style={{ fontSize: 14 }}>⚠️</Text>
                <Text className="text-xs text-red-300 font-medium flex-1 leading-relaxed">
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Seção 1: Confirmação dos Dados do Cliente (PDV) */}
            <View className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 mb-4">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-1.5 flex-1">
                  <Text style={{ fontSize: 13 }}>👤</Text>
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    1. Confirmação dos Dados do Cliente (PDV)
                  </Text>
                </View>
                <Text className="text-[11px] text-amber-400 font-semibold">
                  * Campos Obrigatórios
                </Text>
              </View>

              {/* Nome */}
              <View className="mb-3">
                <Text className="text-xs font-semibold text-slate-300 mb-1">
                  Nome Completo do Cliente *
                </Text>
                <TextInput
                  value={clientName}
                  onChangeText={(t) => {
                    setClientName(t);
                    setError('');
                  }}
                  placeholder="Ex: João da Silva"
                  placeholderTextColor="#64748b"
                  autoCapitalize="words"
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm"
                />
              </View>

              {/* CPF/CNPJ e Telefone */}
              <View className="mb-3">
                <Text className="text-xs font-semibold text-slate-300 mb-1">
                  CPF ou CNPJ *
                </Text>
                <TextInput
                  value={clientDoc}
                  onChangeText={(t) => {
                    setClientDoc(formatCpfCnpj(t));
                    setError('');
                  }}
                  placeholder="000.000.000-00"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  maxLength={18}
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm font-mono"
                />
              </View>

              <View className="mb-3">
                <Text className="text-xs font-semibold text-slate-300 mb-1">
                  Telefone / WhatsApp *
                </Text>
                <TextInput
                  value={clientPhone}
                  onChangeText={(t) => {
                    setClientPhone(formatPhone(t));
                    setError('');
                  }}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                  maxLength={15}
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm font-mono"
                />
              </View>

              {/* CEP */}
              <View className="mb-3">
                <Text className="text-xs font-semibold text-slate-300 mb-1">
                  CEP *
                </Text>
                <View className="relative justify-center">
                  <TextInput
                    value={clientCep}
                    onChangeText={handleCepChange}
                    onBlur={() => handleCepChange(clientCep)}
                    placeholder="00000-000"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                    maxLength={9}
                    className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono"
                  />
                  {loadingCep && (
                    <View className="absolute right-3 top-1/2 -translate-y-1/2">
                      <ActivityIndicator size="small" color="#60a5fa" />
                    </View>
                  )}
                </View>
              </View>

              {/* Endereço */}
              <View>
                <Text className="text-xs font-semibold text-slate-300 mb-1">
                  Endereço Completo (Rua, Número, Bairro, Cidade - UF) *
                </Text>
                <TextInput
                  value={clientAddress}
                  onChangeText={(t) => {
                    setClientAddress(t);
                    setError('');
                  }}
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                  placeholderTextColor="#64748b"
                  multiline
                  numberOfLines={2}
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm leading-snug"
                />
              </View>
            </View>

            {/* Seção 2: Autorização do Administrador */}
            <View className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 mb-4">
              <View className="flex-row items-center gap-1.5 mb-3">
                <Text style={{ fontSize: 13 }}>🛡️</Text>
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  2. Autorização do Administrador
                </Text>
              </View>

              {/* Seletor de Administrador */}
              <View className="mb-3">
                <Text className="text-xs font-semibold text-slate-300 mb-1">
                  Selecione o Administrador Responsável *
                </Text>
                <TouchableOpacity
                  onPress={() => setAdminPickerVisible(true)}
                  activeOpacity={0.8}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 flex-row items-center justify-between"
                >
                  <View className="flex-1 mr-2">
                    {loadingAdmins ? (
                      <Text className="text-slate-400 text-xs">Carregando administradores…</Text>
                    ) : selectedAdmin ? (
                      <View>
                        <Text className="text-sm font-bold text-white">
                          {selectedAdmin.nome}
                        </Text>
                        <Text className="text-xs text-slate-400 font-mono" numberOfLines={1}>
                          {selectedAdmin.email} — [{selectedAdmin.roleLabel}]
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-slate-400 text-sm">Selecione um administrador...</Text>
                    )}
                  </View>
                  <Text className="text-slate-400 text-xs">▼</Text>
                </TouchableOpacity>
              </View>

              {/* Senha do Administrador */}
              <View>
                <Text className="text-xs font-semibold text-slate-300 mb-1">
                  {selectedAdminId === currentUser?.id
                    ? 'Sua Senha de Administrador *'
                    : 'Senha do Administrador *'}
                </Text>
                <View className="relative justify-center">
                  <TextInput
                    value={adminPassword}
                    onChangeText={(t) => {
                      setAdminPassword(t);
                      setError('');
                    }}
                    placeholder="Digite a sua senha de acesso..."
                    placeholderTextColor="#64748b"
                    secureTextEntry={!adminPasswordVisible}
                    className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 pr-12 text-sm"
                  />
                  <TouchableOpacity
                    onPress={() => setAdminPasswordVisible(!adminPasswordVisible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 16 }}>
                      {adminPasswordVisible ? '🙈' : '👁️'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Rodapé com botões de ação */}
          <View className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-900 flex-col gap-2.5">
            {/* Botão de Destaque Principal: Finalizar e Enviar para o PDV */}
            <TouchableOpacity
              onPress={() => handleSubmit(true)}
              disabled={isSubmitting || !adminPassword.trim() || !selectedAdminId}
              activeOpacity={0.85}
              className={`py-4 px-5 rounded-2xl bg-emerald-600 items-center justify-center flex-row gap-2.5 shadow-xl shadow-emerald-950/60 min-h-[54px] ${
                isSubmitting || !adminPassword.trim() || !selectedAdminId
                  ? 'opacity-50'
                  : 'active:bg-emerald-500'
              }`}
            >
              {submittingAction === 'pdv' ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text className="text-sm font-bold text-white">Enviando ao PDV…</Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 18 }}>🛒</Text>
                  <Text className="text-base font-extrabold text-white">
                    Finalizar e Enviar para o PDV →
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Botões Secundários: Cancelar e Apenas Finalizar OS */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={onClose}
                disabled={isSubmitting}
                className="flex-1 py-3 px-3 rounded-xl border border-slate-700 items-center justify-center bg-slate-800/60 min-h-[44px]"
              >
                <Text className="text-sm font-semibold text-slate-300">Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSubmit(false)}
                disabled={isSubmitting || !adminPassword.trim() || !selectedAdminId}
                className={`flex-1 py-3 px-3 rounded-xl border border-slate-600 bg-slate-800 items-center justify-center flex-row gap-1.5 min-h-[44px] ${
                  isSubmitting || !adminPassword.trim() || !selectedAdminId
                    ? 'opacity-50'
                    : 'active:bg-slate-700'
                }`}
              >
                {submittingAction === 'close' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Text style={{ fontSize: 13 }}>🔒</Text>
                    <Text className="text-xs font-bold text-slate-200">Apenas Finalizar OS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Modal Seletor de Administrador */}
        {adminPickerVisible && (
          <Modal
            visible={adminPickerVisible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setAdminPickerVisible(false)}
          >
            <View className="flex-1 bg-black/80 items-center justify-center p-4">
              <View className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-700 p-5 shadow-2xl">
                <View className="flex-row items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <Text className="text-base font-bold text-white">
                    Selecione o Administrador
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAdminPickerVisible(false)}
                    className="w-8 h-8 rounded-full bg-slate-800 items-center justify-center"
                  >
                    <Text className="text-slate-400 font-bold text-sm">✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView className="max-h-80" showsVerticalScrollIndicator={false}>
                  {administradores.length === 0 ? (
                    <View className="py-6 items-center">
                      <Text className="text-slate-400 text-sm">
                        Nenhum administrador encontrado.
                      </Text>
                    </View>
                  ) : (
                    administradores.map((adm) => {
                      const isSelected = adm.id === selectedAdminId;
                      return (
                        <TouchableOpacity
                          key={adm.id}
                          onPress={() => {
                            setSelectedAdminId(adm.id);
                            setAdminPickerVisible(false);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          className={`p-3.5 rounded-xl border mb-2 flex-row items-center justify-between ${
                            isSelected
                              ? 'bg-blue-950/40 border-blue-600'
                              : 'bg-slate-800/80 border-slate-700'
                          }`}
                        >
                          <View className="flex-1 mr-2">
                            <Text
                              className={`text-sm font-bold ${
                                isSelected ? 'text-blue-300' : 'text-white'
                              }`}
                            >
                              {adm.nome}
                            </Text>
                            <Text className="text-xs text-slate-400 font-mono mt-0.5">
                              {adm.email}
                            </Text>
                            <Text className="text-[11px] text-amber-400/90 font-medium mt-1">
                              [{adm.roleLabel}]
                            </Text>
                          </View>
                          {isSelected && (
                            <Text className="text-blue-400 font-bold text-base">✓</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}
