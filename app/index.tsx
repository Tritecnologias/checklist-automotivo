import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';
import { api } from '@/lib/api';
import { lookupCep } from '@/lib/cep';
import { formatPlate, cleanPlate } from '@/hooks/usePlateMask';
import { useAuth } from '@/lib/AuthContext';
import { MecanicoSelectorModal } from '@/components/MecanicoSelectorModal';
import type { Mecanico } from '@/types';

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

function formatCep(val: string) {
  const digits = val.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

// ─── Identificação do Veículo ─────────────────────────────────────────────────

const LAST_MECANICO_KEY = '@last_selected_mecanico_id';

export default function IdentificationScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { logout, user, tenants, activeTenant } = useAuth();

  const { data: mecanicos = [] } = useQuery({
    queryKey: ['mecanicos', activeTenant?.id],
    queryFn: () => api.listMecanicos(true),
    staleTime: 60_000,
  });

  const [selectedMecanicoId, setSelectedMecanicoId] = useState<number | null>(null);
  const [selectedAuxiliarId, setSelectedAuxiliarId] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<'mecanico' | 'auxiliar' | null>(null);

  // Memoriza e restaura o último mecânico selecionado no tablet
  useEffect(() => {
    AsyncStorage.getItem(LAST_MECANICO_KEY)
      .then((savedId) => {
        if (savedId) {
          setSelectedMecanicoId(Number(savedId));
        } else if (user?.mecanicoId) {
          setSelectedMecanicoId(user.mecanicoId);
        }
      })
      .catch(() => {});
  }, [user?.mecanicoId]);

  function handleSelectMecanico(m: Mecanico | null) {
    const id = m ? m.id : null;
    setSelectedMecanicoId(id);
    if (id) {
      AsyncStorage.setItem(LAST_MECANICO_KEY, String(id)).catch(() => {});
    } else {
      AsyncStorage.removeItem(LAST_MECANICO_KEY).catch(() => {});
    }
  }

  function handleSelectAuxiliar(m: Mecanico | null) {
    setSelectedAuxiliarId(m ? m.id : null);
  }

  const currentMecanico = mecanicos.find((m) => m.id === selectedMecanicoId) || null;
  const currentAuxiliar = mecanicos.find((m) => m.id === selectedAuxiliarId) || null;

  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [mileage, setMileage] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientDoc, setClientDoc] = useState('');
  const [clientCep, setClientCep] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'quote' | 'open'>('quote');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const scrollViewRef = useRef<ScrollView>(null);
  const clientNameInputRef = useRef<TextInput>(null);
  const clientPhoneInputRef = useRef<TextInput>(null);
  const clientDocInputRef = useRef<TextInput>(null);
  const clientCepInputRef = useRef<TextInput>(null);
  const clientAddressInputRef = useRef<TextInput>(null);
  const modelInputRef = useRef<TextInput>(null);
  const mileageInputRef = useRef<TextInput>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const cardY = useRef(0);
  const clientSectionY = useRef(0);
  const vehicleSectionY = useRef(0);
  const rawOffsets = useRef<Record<string, { section?: 'client' | 'vehicle'; y: number }>>({});
  const activeFieldRef = useRef<string | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      if (activeFieldRef.current) {
        const fieldKey = activeFieldRef.current;
        const info = rawOffsets.current[fieldKey];
        if (info && scrollViewRef.current) {
          let sectionY = 0;
          if (info.section === 'client') sectionY = clientSectionY.current;
          if (info.section === 'vehicle') sectionY = vehicleSectionY.current;
          const targetY = Math.max(0, cardY.current + sectionY + info.y - 80);
          scrollViewRef.current.scrollTo({ y: targetY, animated: true });
        }
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      activeFieldRef.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function scrollToField(fieldKey: string) {
    activeFieldRef.current = fieldKey;
    setTimeout(() => {
      const info = rawOffsets.current[fieldKey];
      if (info && scrollViewRef.current) {
        let sectionY = 0;
        if (info.section === 'client') sectionY = clientSectionY.current;
        if (info.section === 'vehicle') sectionY = vehicleSectionY.current;
        const targetY = Math.max(0, cardY.current + sectionY + info.y - 80);
        scrollViewRef.current.scrollTo({ y: targetY, animated: true });
      }
    }, 100);
  }

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
    setClientCep('');
    setClientAddress('');
    setClientId(null);
    setSelectedAuxiliarId(null);
    setLookupFeedback(null);
    setErrors({});
  }

  async function handleCepChange(text: string) {
    const formatted = formatCep(text);
    setClientCep(formatted);
    setErrors((prev) => ({ ...prev, clientCep: '' }));
    const clean = formatted.replace(/\D/g, '');
    if (clean.length === 8) {
      setCepLoading(true);
      try {
        const res = await lookupCep(clean);
        if (res && res.formattedAddress) {
          setClientAddress(res.formattedAddress);
          setErrors((prev) => ({ ...prev, clientAddress: '' }));
        }
      } catch {
        // silencioso
      } finally {
        setCepLoading(false);
      }
    }
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
          if (res.client.cep) setClientCep(formatCep(res.client.cep));
          if (res.client.address) setClientAddress(res.client.address);
        }
        setLookupFeedback('✨ Cadastro localizado! Valide os dados abaixo.');
      } else {
        setClientId(null);
        setClientName('');
        setClientPhone('');
        setClientDoc('');
        setClientCep('');
        setClientAddress('');
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
      client: { id?: number | null; name: string; phone: string; document?: string; cep?: string; address?: string };
      status: 'quote' | 'open';
      mecanicoId?: number | null;
      auxiliarId?: number | null;
    }) => api.createOrder(vars.vehicle, vars.status, vars.client, vars.mecanicoId, vars.auxiliarId),
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
      setClientCep('');
      setClientAddress('');
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
    if (orderType === 'quote') {
      const cleanC = clientCep.replace(/\D/g, '');
      if (!cleanC || cleanC.length !== 8) {
        next.clientCep = 'CEP obrigatório para orçamento (8 dígitos).';
      }
      if (!clientAddress.trim() || clientAddress.trim().length < 3) {
        next.clientAddress = 'Endereço obrigatório para orçamento.';
      }
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
        cep: clientCep.trim() || undefined,
        address: clientAddress.trim() || undefined,
      },
      status: orderType,
      mecanicoId: selectedMecanicoId || undefined,
      auxiliarId: selectedAuxiliarId || undefined,
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerClassName="px-5 pt-16"
        contentContainerStyle={{
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        {/* Logo / título */}
        <View className="items-center mb-10">
          <View className="w-full flex-row justify-between items-center mb-2">
            {/* Sessão do tablet e Seletor Rápido de Técnico */}
            {user && (
              <View className="flex-row items-center gap-2 flex-shrink mr-2">
                <View className="flex-shrink">
                  <Text className="text-xs font-semibold text-slate-700 dark:text-slate-300" numberOfLines={1}>
                    👤 {user.nome}
                  </Text>
                </View>
                {/* Botão Quick Switch de Operador/Mecânico */}
                <TouchableOpacity
                  onPress={() => setModalMode('mecanico')}
                  activeOpacity={0.75}
                  className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                >
                  <Text style={{ fontSize: 11 }}>🔧</Text>
                  <Text className="text-xs font-bold text-blue-700 dark:text-blue-300" numberOfLines={1}>
                    {currentMecanico ? (currentMecanico.apelido || currentMecanico.nome) : 'Trocar Técnico'}
                  </Text>
                  <Text className="text-[10px] text-blue-500 dark:text-blue-400 font-bold">▼</Text>
                </TouchableOpacity>
              </View>
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
        <View
          onLayout={(e) => {
            cardY.current = e.nativeEvent.layout.y;
          }}
          className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-slate-700"
        >

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

          {/* Responsáveis pelo Serviço */}
          <View className="mb-5 pt-4 border-t border-gray-100 dark:border-slate-700/60">
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2.5">
              👨‍🔧 Responsáveis pelo Serviço
            </Text>
            <View className="gap-2.5">
              {/* Mecânico Responsável */}
              <TouchableOpacity
                onPress={() => setModalMode('mecanico')}
                activeOpacity={0.75}
                className={`p-3.5 rounded-2xl border flex-row items-center justify-between ${
                  currentMecanico
                    ? 'border-blue-200 dark:border-blue-800/80 bg-blue-50/40 dark:bg-blue-950/20'
                    : 'border-dashed border-gray-300 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40'
                }`}
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <View
                    className={`w-10 h-10 rounded-xl items-center justify-center ${
                      currentMecanico ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    <Text style={{ fontSize: 18 }}>🔧</Text>
                  </View>
                  <View className="flex-1 mr-2">
                    <Text className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                      Técnico / Mecânico Responsável
                    </Text>
                    <Text
                      className={`text-sm font-bold mt-0.5 ${
                        currentMecanico
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-400 dark:text-slate-500 italic'
                      }`}
                      numberOfLines={1}
                    >
                      {currentMecanico
                        ? `${currentMecanico.nome}${currentMecanico.apelido && currentMecanico.apelido !== currentMecanico.nome ? ` (${currentMecanico.apelido})` : ''}`
                        : 'Nenhum mecânico selecionado (Toque para escolher)'}
                    </Text>
                  </View>
                </View>
                <View className="px-3 py-1.5 rounded-xl bg-blue-600">
                  <Text className="text-xs font-bold text-white">
                    {currentMecanico ? 'Trocar' : 'Selecionar'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Auxiliar / Colaborador (Opcional) */}
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() => setModalMode('auxiliar')}
                  activeOpacity={0.75}
                  className={`flex-1 p-3 rounded-2xl border flex-row items-center justify-between ${
                    currentAuxiliar
                      ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/40 dark:bg-amber-950/20'
                      : 'border-dashed border-gray-200 dark:border-slate-700/60 bg-transparent'
                  }`}
                >
                  <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                    <View
                      className={`w-8 h-8 rounded-lg items-center justify-center ${
                        currentAuxiliar ? 'bg-amber-500' : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      <Text style={{ fontSize: 15 }}>🤝</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">
                        Auxiliar / Colaborador (Opcional)
                      </Text>
                      <Text
                        className={`text-xs font-semibold mt-0.5 ${
                          currentAuxiliar
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-400 dark:text-slate-500'
                        }`}
                        numberOfLines={1}
                      >
                        {currentAuxiliar
                          ? `${currentAuxiliar.nome}${currentAuxiliar.apelido && currentAuxiliar.apelido !== currentAuxiliar.nome ? ` (${currentAuxiliar.apelido})` : ''}`
                          : '+ Adicionar auxiliar na O.S.'}
                      </Text>
                    </View>
                  </View>
                  <View className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-slate-800">
                    <Text className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">
                      {currentAuxiliar ? 'Alterar' : 'Adicionar'}
                    </Text>
                  </View>
                </TouchableOpacity>
                {currentAuxiliar && (
                  <TouchableOpacity
                    onPress={() => handleSelectAuxiliar(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 items-center justify-center"
                  >
                    <Text className="text-red-600 dark:text-red-400 font-bold text-xs">✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Placa */}
          <View
            onLayout={(e) => {
              rawOffsets.current['plate'] = { y: e.nativeEvent.layout.y };
            }}
            className="mb-5"
          >
            <Text className={labelStyle}>
              Placa <Text className="text-red-500">*</Text>
            </Text>
            <View className="relative justify-center">
              <TextInput
                className={errors.plate ? inputErrorStyle : inputStyle}
                value={plate}
                onChangeText={handlePlateChange}
                onFocus={() => scrollToField('plate')}
                placeholder="ABC-1234 ou ABC1D23"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                returnKeyType="next"
                onSubmitEditing={() => clientNameInputRef.current?.focus()}
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
          <View
            onLayout={(e) => {
              clientSectionY.current = e.nativeEvent.layout.y;
            }}
            className="mb-5 pt-4 border-t border-gray-100 dark:border-slate-700/60"
          >
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">
              👤 Dados do Cliente
            </Text>

            {/* Nome do Cliente */}
            <View
              onLayout={(e) => {
                rawOffsets.current['clientName'] = { section: 'client', y: e.nativeEvent.layout.y };
              }}
              className="mb-3.5"
            >
              <Text className={labelStyle}>
                Nome completo <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                ref={clientNameInputRef}
                className={errors.clientName ? inputErrorStyle : inputStyle}
                value={clientName}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, clientName: '' }));
                  setClientName(t);
                }}
                onFocus={() => scrollToField('clientName')}
                placeholder="Nome completo do cliente"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => clientPhoneInputRef.current?.focus()}
              />
              {errors.clientName ? <Text className={errorStyle}>⚠ {errors.clientName}</Text> : null}
            </View>

            {/* Telefone / WhatsApp */}
            <View
              onLayout={(e) => {
                rawOffsets.current['clientPhone'] = { section: 'client', y: e.nativeEvent.layout.y };
              }}
              className="mb-3.5"
            >
              <Text className={labelStyle}>
                Telefone / WhatsApp <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                ref={clientPhoneInputRef}
                className={errors.clientPhone ? inputErrorStyle : inputStyle}
                value={clientPhone}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, clientPhone: '' }));
                  setClientPhone(formatPhone(t));
                }}
                onFocus={() => scrollToField('clientPhone')}
                placeholder="(00) 00000-0000"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                keyboardType="phone-pad"
                returnKeyType="next"
                onSubmitEditing={() => clientDocInputRef.current?.focus()}
              />
              {errors.clientPhone ? <Text className={errorStyle}>⚠ {errors.clientPhone}</Text> : null}
            </View>

            {/* CPF / CNPJ (Opcional) */}
            <View
              onLayout={(e) => {
                rawOffsets.current['clientDoc'] = { section: 'client', y: e.nativeEvent.layout.y };
              }}
              className="mb-3.5"
            >
              <Text className={labelStyle}>CPF / CNPJ (opcional)</Text>
              <TextInput
                ref={clientDocInputRef}
                className={inputStyle}
                value={clientDoc}
                onChangeText={(t) => setClientDoc(formatDoc(t))}
                onFocus={() => scrollToField('clientDoc')}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                keyboardType="numeric"
                returnKeyType="next"
                onSubmitEditing={() => clientCepInputRef.current?.focus()}
              />
            </View>

            {/* CEP */}
            <View
              onLayout={(e) => {
                rawOffsets.current['clientCep'] = { section: 'client', y: e.nativeEvent.layout.y };
              }}
              className="mb-3.5"
            >
              <Text className={labelStyle}>
                CEP {orderType === 'quote' && <Text className="text-red-500">*</Text>}
              </Text>
              <View className="relative justify-center">
                <TextInput
                  ref={clientCepInputRef}
                  className={errors.clientCep ? inputErrorStyle : inputStyle}
                  value={clientCep}
                  onChangeText={handleCepChange}
                  onFocus={() => scrollToField('clientCep')}
                  placeholder="00000-000"
                  placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                  keyboardType="numeric"
                  maxLength={9}
                  returnKeyType="next"
                  onSubmitEditing={() => clientAddressInputRef.current?.focus()}
                />
                {cepLoading && (
                  <View className="absolute right-4">
                    <ActivityIndicator size="small" color="#3b82f6" />
                  </View>
                )}
              </View>
              {errors.clientCep ? <Text className={errorStyle}>⚠ {errors.clientCep}</Text> : null}
            </View>

            {/* Endereço */}
            <View
              onLayout={(e) => {
                rawOffsets.current['clientAddress'] = { section: 'client', y: e.nativeEvent.layout.y };
              }}
            >
              <Text className={labelStyle}>
                Endereço completo {orderType === 'quote' && <Text className="text-red-500">*</Text>}
              </Text>
              <TextInput
                ref={clientAddressInputRef}
                className={errors.clientAddress ? inputErrorStyle : inputStyle}
                value={clientAddress}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, clientAddress: '' }));
                  setClientAddress(t);
                }}
                onFocus={() => scrollToField('clientAddress')}
                placeholder="Rua, número, bairro, cidade - UF"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => modelInputRef.current?.focus()}
              />
              {errors.clientAddress ? <Text className={errorStyle}>⚠ {errors.clientAddress}</Text> : null}
            </View>
          </View>

          {/* Dados do Veículo */}
          <View
            onLayout={(e) => {
              vehicleSectionY.current = e.nativeEvent.layout.y;
            }}
            className="pt-4 border-t border-gray-100 dark:border-slate-700/60"
          >
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">
              🚗 Dados do Veículo
            </Text>

            {/* Modelo */}
            <View
              onLayout={(e) => {
                rawOffsets.current['model'] = { section: 'vehicle', y: e.nativeEvent.layout.y };
              }}
              className="mb-3.5"
            >
              <Text className={labelStyle}>
                Modelo do veículo <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                ref={modelInputRef}
                className={errors.model ? inputErrorStyle : inputStyle}
                value={model}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, model: '' }));
                  setModel(t);
                }}
                onFocus={() => scrollToField('model')}
                placeholder="Ex: Volkswagen Gol 1.0 2019"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => mileageInputRef.current?.focus()}
              />
              {errors.model ? <Text className={errorStyle}>⚠ {errors.model}</Text> : null}
            </View>

            {/* Quilometragem */}
            <View
              onLayout={(e) => {
                rawOffsets.current['mileage'] = { section: 'vehicle', y: e.nativeEvent.layout.y };
              }}
            >
              <Text className={labelStyle}>
                Quilometragem atual <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                ref={mileageInputRef}
                className={errors.mileage ? inputErrorStyle : inputStyle}
                value={mileage}
                onChangeText={(t) => {
                  setErrors((prev) => ({ ...prev, mileage: '' }));
                  setMileage(t.replace(/\D/g, ''));
                }}
                onFocus={() => scrollToField('mileage')}
                placeholder="Ex: 85000"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
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

      <MecanicoSelectorModal
        visible={modalMode !== null}
        title={
          modalMode === 'mecanico'
            ? 'Mecânico / Técnico Responsável'
            : 'Auxiliar / Colaborador'
        }
        subtitle={
          modalMode === 'mecanico'
            ? 'Selecione quem executará os serviços desta O.S.'
            : 'Selecione o ajudante/auxiliar desta O.S. (opcional)'
        }
        mecanicos={mecanicos}
        selectedId={modalMode === 'mecanico' ? selectedMecanicoId : selectedAuxiliarId}
        clearLabel={
          modalMode === 'mecanico'
            ? 'Sem mecânico atribuído'
            : 'Nenhum auxiliar'
        }
        onSelect={(m) => {
          if (modalMode === 'mecanico') {
            handleSelectMecanico(m);
          } else {
            handleSelectAuxiliar(m);
          }
        }}
        onClose={() => setModalMode(null)}
      />
    </KeyboardAvoidingView>
  );
}
