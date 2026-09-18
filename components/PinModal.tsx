import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useVerifyPin } from '@/hooks/useOrderMutations';

// ─── Numpad personalizado — dedão com luva passa direto ──────────────────────

const NUMPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
] as const;

interface PinModalProps {
  visible: boolean;
  /** Descrição do item alvo (exibida no modal) */
  itemDescription?: string;
  /** Chamado apenas após PIN validado com sucesso pelo backend */
  onAuthorized: () => void;
  onCancel: () => void;
}

export function PinModal({
  visible,
  itemDescription,
  onAuthorized,
  onCancel,
}: PinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { mutate: verifyPin, isPending } = useVerifyPin();

  // Reseta estado ao abrir
  useEffect(() => {
    if (visible) {
      setPin('');
      setError('');
    }
  }, [visible]);

  // Submete automaticamente quando o 4º dígito é inserido
  useEffect(() => {
    if (pin.length === 4) handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function handleKey(key: string) {
    if (isPending) return;
    setError('');

    if (key === '⌫') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === '') return;
    if (pin.length >= 4) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((p) => p + key);
  }

  function handleSubmit() {
    if (pin.length !== 4) return;

    verifyPin(pin, {
      onSuccess: (result) => {
        if (result.authorized) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onAuthorized();
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError('PIN inválido. Tente novamente.');
          setPin('');
        }
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError('Erro de conexão. Tente novamente.');
        setPin('');
      },
    });
  }

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
          {/* Cabeçalho */}
          <Text className="text-xl font-bold text-gray-900 dark:text-white text-center">
            Autorização de Supervisor
          </Text>

          {itemDescription ? (
            <Text
              className="text-sm text-gray-500 dark:text-slate-400 text-center mt-2"
              numberOfLines={2}
            >
              {itemDescription}
            </Text>
          ) : null}

          {/* Indicador de dígitos */}
          <View className="flex-row justify-center gap-4 my-7">
            {Array.from({ length: 4 }, (_, i) => (
              <View
                key={i}
                className={`w-5 h-5 rounded-full border-2 ${
                  i < pin.length
                    ? 'bg-blue-600 border-blue-600 dark:bg-blue-400 dark:border-blue-400'
                    : 'bg-transparent border-gray-300 dark:border-slate-600'
                }`}
              />
            ))}
          </View>

          {/* Mensagem de erro */}
          {error ? (
            <Text className="text-red-500 dark:text-red-400 text-sm text-center -mt-3 mb-4 font-medium">
              {error}
            </Text>
          ) : (
            <View className="mb-4 h-5" />
          )}

          {/* Numpad */}
          <View className="gap-3">
            {NUMPAD_ROWS.map((row, rowIdx) => (
              <View key={rowIdx} className="flex-row justify-center gap-3">
                {row.map((key, colIdx) => (
                  <TouchableOpacity
                    key={`${rowIdx}-${colIdx}`}
                    onPress={() => handleKey(key)}
                    disabled={isPending || key === ''}
                    activeOpacity={key ? 0.6 : 1}
                    className={`w-20 h-14 rounded-2xl items-center justify-center ${
                      key === ''
                        ? 'bg-transparent'
                        : key === '⌫'
                        ? 'bg-gray-100 dark:bg-slate-700'
                        : 'bg-gray-100 dark:bg-slate-700 active:bg-gray-200 dark:active:bg-slate-600'
                    }`}
                  >
                    {key === '⌫' ? (
                      isPending ? (
                        <ActivityIndicator size="small" color="#6b7280" />
                      ) : (
                        <Text className="text-xl text-gray-500 dark:text-slate-400">⌫</Text>
                      )
                    ) : (
                      <Text className="text-2xl font-semibold text-gray-900 dark:text-white">
                        {key}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          {/* Loading overlay */}
          {isPending && (
            <View className="mt-4 flex-row items-center justify-center gap-2">
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text className="text-sm text-blue-600 dark:text-blue-400">
                Verificando…
              </Text>
            </View>
          )}

          {/* Cancelar */}
          <TouchableOpacity
            onPress={onCancel}
            disabled={isPending}
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
