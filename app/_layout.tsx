import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { queryClient } from '@/lib/queryClient';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
          },
          headerTintColor: isDark ? '#f1f5f9' : '#0f172a',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: {
            backgroundColor: isDark ? '#0f172a' : '#f8fafc',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'Checklist Automotivo', headerShown: false }}
        />
        <Stack.Screen
          name="orders"
          options={{ title: 'Ordens de Serviço', headerBackTitle: 'Voltar' }}
        />
        <Stack.Screen
          name="order/[id]"
          options={{ title: 'Comanda de Serviços', headerBackTitle: 'Voltar' }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
