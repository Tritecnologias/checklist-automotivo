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

// ─── Identificação do Veículo ─────────────────────────────────────────────────

export default function IdentificationScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { logout, user, tenants, activeTenant } = useAuth();

  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [mileage, setMileage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasContent = plate.length > 0 || model.length > 0 || mileage.length > 0;
  const plateValid = cleanPlate(plate).length >= 7;

  function handleClear() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlate('');
    setModel('');
    setMileage('');
    setErrors({});
  }

  const { mutate: createOrder, isPending } = useMutation({
    mutationFn: api.createOrder,
    onSuccess: (order) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/order/${order.id}`);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors((prev) => ({ ...prev, submit: 'Erro ao abrir OS. Verifique a conexão.' }));
    },
  });

  function handlePlateChange(text: string) {
    setErrors((prev) => ({ ...prev, plate: '' }));
    setPlate(formatPlate(text));
  }

  function validate() {
    const next: Record<string, string> = {};
    const rawPlate = cleanPlate(plate);

    if (rawPlate.length < 7) next.plate = 'Placa inválida (mín. 7 caracteres).';
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
      plate: cleanPlate(plate),
      model: model.trim(),
      mileage: parseInt(mileage.replace(/\D/g, ''), 10),
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
                  onPress={() => router.push('/select-tenant')}
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

          {/* Placa */}
          <View className="mb-5">
            <Text className={labelStyle}>
              Placa <Text className="text-red-500">*</Text>
            </Text>
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
            {errors.plate ? (
              <Text className={errorStyle}>⚠ {errors.plate}</Text>
            ) : plate.length > 0 && !plateValid ? (
              <Text className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                Continue digitando… ({cleanPlate(plate).length}/7)
              </Text>
            ) : null}
          </View>

          {/* Modelo */}
          <View className="mb-5">
            <Text className={labelStyle}>Modelo</Text>
            <TextInput
              className={inputStyle}
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
            {errors.model ? <Text className={errorStyle}>{errors.model}</Text> : null}
          </View>

          {/* Quilometragem */}
          <View>
            <Text className={labelStyle}>Quilometragem atual</Text>
            <TextInput
              className={inputStyle}
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
              <Text className={errorStyle}>{errors.mileage}</Text>
            ) : null}
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
              ? 'bg-blue-300 dark:bg-blue-900'
              : 'bg-blue-600 dark:bg-blue-500'
          }`}
        >
          {isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-base">
              Abrir Ordem de Serviço
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
