import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function SelectTenantScreen() {
  const { tenants, activeTenant, selectTenant, logout } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null);

  async function handleSelect(tenant: typeof tenants[number]) {
    try {
      setLoading(tenant.id);
      await selectTenant(tenant);
      router.replace('/');
    } catch (e: any) {
      setLoading(null);
    }
  }

  return (
    <View className="flex-1 bg-slate-900 items-center justify-center px-6">
      <View className="w-full max-w-sm">
        <Text className="text-2xl font-bold text-white text-center mb-2">
          Selecionar Loja
        </Text>
        <Text className="text-slate-400 text-sm text-center mb-8">
          Escolha em qual loja você vai trabalhar agora
        </Text>

        <View className="gap-3">
          {tenants.map(t => {
            const isActive = activeTenant?.id === t.id;
            const isLoading = loading === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => handleSelect(t)}
                disabled={loading !== null}
                activeOpacity={0.7}
                className={`flex-row items-center justify-between px-5 py-4 rounded-2xl border ${
                  isActive
                    ? 'bg-blue-600 border-blue-500'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <View className={`w-9 h-9 rounded-xl items-center justify-center ${
                    isActive ? 'bg-blue-500' : 'bg-slate-700'
                  }`}>
                    <Text className="text-lg">🏪</Text>
                  </View>
                  <View>
                    <Text className="text-base font-semibold text-white">{t.nome}</Text>
                    <Text className="text-xs text-slate-400">{t.slug}</Text>
                  </View>
                </View>
                {isLoading ? (
                  <ActivityIndicator size="small" color="#60a5fa" />
                ) : isActive ? (
                  <Text className="text-blue-200 text-xs font-semibold">ATIVA</Text>
                ) : (
                  <Text className="text-slate-500 text-xs">→</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={logout}
          className="mt-8 py-3 items-center"
        >
          <Text className="text-slate-500 text-sm">Sair da conta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
