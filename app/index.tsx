import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';
import { api } from '@/lib/api';
import { formatPlate, cleanPlate } from '@/hooks/usePlateMask';
import { useAuth } from '@/lib/AuthContext';

function ListIcon() {
  return (
    <Text style={{ fontSize: 20 }}>📋</Text>
  );
}

function formatPhone(val: string) {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function formatDoc(val: string) {
  const digits = val.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  } else {
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
}

// ─── Identificação do Veículo ─────────────────────────────────────────────────

export default function IdentificationScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { logout, user, tenants, activeTenant } = useAuth();

  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [mileage, setMileage] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientDoc, setClientDoc] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'quote' | 'open'>('quote');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasContent = plate.length > 0 || model.length > 0 || mileage.length > 0 || clientName.length > 0;
  const plateValid = cleanPlate(plate).length >= 7;

  function handleClear() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlate('');
    setModel('');
    setMileage('');
    setClientName('');
    setClientPhone('');
    setClientDoc('');
    setClientId(null);
    setLookupFeedback(null);
    setErrors({});
  }

  async function triggerLookup(plateText: string) {
    const clean = cleanPlate(plateText);
    if (clean.length < 7) return;
    setLookupLoading(true);
    setLookupFeedback(null);
    try {
      const res = await api.lookupPlate(clean);
      if (res.found) {
        if (res.vehicle?.model) setModel(res.vehicle.model);
        if (res.vehicle?.mileage) setMileage(String(res.vehicle.mileage));
        if (res.client) {
          setClientId(res.client.id ?? null);
          if (res.client.name) setClientName(res.client.name);
          if (res.client.phone) setClientPhone(res.client.phone);
          if (res.client.document) setClientDoc(res.client.document);
        }
        setLookupFeedback('✨ Cadastro localizado! Valide os dados abaixo.');
      } else {
        setClientId(null);
        setClientName('');
        setClientPhone('');
        setClientDoc('');
        setModel('');
        setMileage('');
        setLookupFeedback('🆕 Novo cadastro! Informe o contato do cliente.');
      }
    } catch {
      // silencioso
    } finally {
      setLookupLoading(false);
    }
  }

  const { mutate: createOrder, isPending } = useMutation({
    mutationFn: (vars: {
      vehicle: { plate: string; model: string; mileage: number };
      client: { id?: number | null; name: string; phone: string; document?: string };
      status: 'quote' | 'open';
    }) => api.createOrder(vars.vehicle, vars.status, vars.client),
    onSuccess: (order) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/order/${order.id}`);
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors((prev) => ({
        ...prev,
        submit: err?.message || 'Erro ao abrir OS. Verifique a conexão.',
      }));
    },
  });

  function handlePlateChange(text: string) {
    setErrors((prev) => ({ ...prev, plate: '' }));
    const formatted = formatPlate(text);
    setPlate(formatted);
    const clean = cleanPlate(formatted);
    if (clean.length === 7) {
      triggerLookup(formatted);
    } else if (clean.length < 7 && clientId) {
      setClientId(null);
      setClientName('');
      setClientPhone('');
      setClientDoc('');
      setModel('');
      setMileage('');
      setLookupFeedback(null);
    }
  }

  function validate() {
    const next: Record<string, string> = {};
    const rawPlate = cleanPlate(plate);

    if (rawPlate.length < 7) next.plate = 'Placa inválida (mín. 7 caracteres).';
    if (!clientName.trim()) next.clientName = 'Informe o nome completo do cliente.';
    if (!clientPhone.trim() || clientPhone.replace(/\D/g, '').length < 8) {
      next.clientPhone = 'Informe o telefone/WhatsApp do cliente.';
    }
    if (!model.trim()) next.model = 'Informe o modelo do veículo.';
    const km = parseInt(mileage.replace(/\D/g, ''), 10);
    if (!mileage || isNaN(km) || km < 0) next.mileage = 'Quilometragem inválida.';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit() {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    createOrder({
      vehicle: {
        plate: cleanPlate(plate),
        model: model.trim(),
        mileage: parseInt(mileage.replace(/\D/g, ''), 10),
      },
      client: {
        id: clientId,
        name: clientName.trim(),
        phone: clientPhone.trim(),
        document: clientDoc.trim() || undefined,
      },
      status: orderType,
    });
  }

  const inputStyle =
    'bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 text-base border border-gray-200 dark:border-slate-700';
  const inputErrorStyle =
    'bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl px-4 py-3.5 text-base border-2 border-red-500 dark:border-red-400';

  const labelStyle = 'text-sm font-semibold text-gray-600 dark:text-slate-400 mb-1.5';
  const errorStyle = 'text-xs text-red-500 dark:text-red-400 mt-1';

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50 dark:bg-slate-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-16 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / título */}
        <View className="items-center mb-10">
          <View className="w-full flex-row justify-between items-center mb-2">
            {/* Nome do usuário logado */}
            {user && (
              <Text className="text-xs text-slate-500 dark:text-slate-400 flex-shrink">
                👤 {user.nome}
              </Text>
            )}
            <View className="flex-row items-center gap-2 ml-auto">
              {hasContent && (
                <TouchableOpacity
                  onPress={handleClear}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/30"
                >
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                  <Text className="text-sm font-semibold text-red-600 dark:text-red-400">
                    Limpar
                  </Text>
                </TouchableOpacity>
              )}
              {tenants.length > 1 && (
                <TouchableOpacity
                  onPress={() => router.push('/select-tenant' as any)}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800"
                >
                  <Text style={{ fontSize: 14 }}>🏪</Text>
                  <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Trocar loja
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.push('/orders')}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-slate-800"
              >
                <ListIcon />
                <Text className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                  Ver OS
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  await logout();
                  router.replace('/login');
                }}
                className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <Text style={{ fontSize: 14 }}>🚪</Text>
                <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Sair
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View className="w-16 h-16 rounded-2xl bg-blue-600 items-center justify-center mb-4">
            <Text style={{ fontSize: 32 }}>🔧</Text>
          </View>

          {/* Lojas do usuário — exibe acima do título */}
          {tenants.length > 0 && (
            <View className="flex-row flex-wrap justify-center gap-2 mb-3">
              {[...tenants]
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                .map(t => {
                  const isActive = activeTenant?.id === t.id;
                  return (
                    <View
                      key={t.id}
                      className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full ${
                        isActive
                          ? 'bg-blue-600'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    >
                      <Text style={{ fontSize: 12 }}>🏪</Text>
                      <Text className={`text-xs font-semibold ${
                        isActive
                          ? 'text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {t.nome}
                      </Text>
                    </View>
                  );
                })}
            </View>
          )}

          <Text className="text-3xl font-bold text-gray-900 dark:text-white">
            Ordem de Serviço
          </Text>
          <Text className="text-base text-gray-500 dark:text-slate-400 mt-1">
            Identifique o veículo para iniciar
          </Text>
        </View>

        {/* Card do formulário */}
        <View className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">

          {/* Seleção do Tipo: Orçamento vs OS */}
          <View className="mb-5">
            <Text className={labelStyle}>Tipo de Atendimento</Text>
            <View className="flex-row gap-2.5">
              <TouchableOpacity
                onPress={() => setOrderType('quote')}
                activeOpacity={0.8}
                className={`flex-1 py-3 px-2 rounded-2xl items-center border ${
                  orderType === 'quote'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40'
                    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60'
                }`}
              >
                <Text style={{ fontSize: 18 }}>📋</Text>
                <Text className={`text-xs font-bold mt-1 ${
                  orderType === 'quote' ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-slate-400'
                }`}>
                  Orçamento
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setOrderType('open')}
                activeOpacity={0.8}
                className={`flex-1 py-3 px-2 rounded-2xl items-center border ${
                  orderType === 'open'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60'
                }`}
              >
                <Text style={{ fontSize: 18 }}>🔧</Text>
                <Text className={`text-xs font-bold mt-1 ${
                  orderType === 'open' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-slate-400'
                }`}>
                  Ordem de Serviço
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Placa */}
          <View className="mb-5">
            <Text className={labelStyle}>
              Placa <Text className="text-red-500">*</Text>
            </Text>
            <View className="relative justify-center">
              <TextInput
                className={errors.plate ? inputErrorStyle : inputStyle}
                value={plate}
                onChangeText={handlePlateChange}
                placeholder="ABC-1234 ou ABC1D23"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                returnKeyType="next"
                autoFocus
              />
              {lookupLoading && (
                <View className="absolute right-4">
                  <ActivityIndicator size="small" color="#3b82f6" />
                </View>
              )}
            </View>
            {errors.plate ? (
              <Text className={errorStyle}>⚠ {errors.plate}</Text>
            ) : plate.length > 0 && !plateValid ? (
              <Text className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                Continue digitando… ({cleanPlate(plate).length}/7)
              </Text>
            ) : null}
            {lookupFeedback && (
              <View className="mt-2.5 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50">
                <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {lookupFeedback}
                </Text>
              </View>
            )}
          </View>

          {/* Dados do Cliente */}
          <View className="mb-5 pt-4 border-t border-gray-100 dark:border-slate-700/60">
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">
              👤 Dados do Cliente
            </Text>

            {/* Nome do Cliente */}
            <View className="mb-3.5">
              <Text className={labelStyle}>
                Nome completo <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className={errors.clientName ? inputErrorStyle : inputStyle}
                value={clientName}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, clientName: '' }));
                  setClientName(t);
                }}
                placeholder="Nome completo do cliente"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                autoCapitalize="words"
                returnKeyType="next"
              />
              {errors.clientName ? <Text className={errorStyle}>⚠ {errors.clientName}</Text> : null}
            </View>

            {/* Telefone / WhatsApp */}
            <View className="mb-3.5">
              <Text className={labelStyle}>
                Telefone / WhatsApp <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className={errors.clientPhone ? inputErrorStyle : inputStyle}
                value={clientPhone}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, clientPhone: '' }));
                  setClientPhone(formatPhone(t));
                }}
                placeholder="(00) 00000-0000"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                keyboardType="phone-pad"
                returnKeyType="next"
              />
              {errors.clientPhone ? <Text className={errorStyle}>⚠ {errors.clientPhone}</Text> : null}
            </View>

            {/* CPF / CNPJ (Opcional) */}
            <View>
              <Text className={labelStyle}>CPF / CNPJ (opcional)</Text>
              <TextInput
                className={inputStyle}
                value={clientDoc}
                onChangeText={(t) => setClientDoc(formatDoc(t))}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                keyboardType="numeric"
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Dados do Veículo */}
          <View className="pt-4 border-t border-gray-100 dark:border-slate-700/60">
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">
              🚗 Dados do Veículo
            </Text>

            {/* Modelo */}
            <View className="mb-3.5">
              <Text className={labelStyle}>
                Modelo do veículo <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className={errors.model ? inputErrorStyle : inputStyle}
                value={model}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, model: '' }));
                  setModel(t);
                }}
                placeholder="Ex: Volkswagen Gol 1.0 2019"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                autoCorrect={false}
                returnKeyType="next"
              />
              {errors.model ? <Text className={errorStyle}>⚠ {errors.model}</Text> : null}
            </View>

            {/* Quilometragem */}
            <View>
              <Text className={labelStyle}>
                Quilometragem atual <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className={errors.mileage ? inputErrorStyle : inputStyle}
                value={mileage}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, mileage: '' }));
                  setMileage(t.replace(/\D/g, ''));
                }}
                placeholder="Ex: 85000"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              {errors.mileage ? (
                <Text className={errorStyle}>⚠ {errors.mileage}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Erro de submissão */}
        {errors.submit ? (
          <Text className="text-red-500 dark:text-red-400 text-sm text-center mt-4">
            {errors.submit}
          </Text>
        ) : null}

        {/* CTA */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isPending || !plateValid}
          activeOpacity={0.8}
          className={`mt-6 py-4 rounded-2xl items-center ${
            isPending || !plateValid
              ? orderType === 'quote' ? 'bg-purple-300 dark:bg-purple-900' : 'bg-blue-300 dark:bg-blue-900'
              : orderType === 'quote' ? 'bg-purple-600 dark:bg-purple-500' : 'bg-blue-600 dark:bg-blue-500'
          }`}
        >
          {isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-base">
              {orderType === 'quote' ? '📋 Criar Orçamento' : '🔧 Abrir Ordem de Serviço'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
