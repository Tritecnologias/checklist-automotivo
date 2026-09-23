import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setError('');
    setIsLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isLoading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50 dark:bg-slate-950"
    >
      <View className="flex-1 justify-center px-6">
        {/* Logo / Título */}
        <View className="items-center mb-10">
          <Text className="text-4xl font-bold text-blue-600 dark:text-blue-400">🔧</Text>
          <Text className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-50">
            Checklist Automotivo
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Entre com suas credenciais
          </Text>
        </View>

        {/* Formulário */}
        <View className="gap-4">
          <View>
            <Text className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              E-mail
            </Text>
            <TextInput
              className="h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-slate-900 dark:text-slate-50 text-base"
              placeholder="seu@email.com"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              autoFocus
            />
          </View>

          <View>
            <Text className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              Senha
            </Text>
            <TextInput
              className="h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-slate-900 dark:text-slate-50 text-base"
              placeholder="••••••••"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          {error !== '' && (
            <View className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3">
              <Text className="text-sm text-red-700 dark:text-red-400 text-center">{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleLogin}
            disabled={!canSubmit}
            className={`mt-2 h-12 items-center justify-center rounded-xl ${
              canSubmit
                ? 'bg-blue-600 dark:bg-blue-500'
                : 'bg-blue-300 dark:bg-blue-900'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">Entrar</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
