import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { queryClient } from '@/lib/queryClient';

function AuthGate() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inLoginScreen = segments[0] === 'login';
    if (!token && !inLoginScreen) {
      router.replace('/login');
    } else if (token && inLoginScreen) {
      router.replace('/');
    }
  }, [token, isLoading, segments]);

  return null;
}

function RootLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AuthGate />
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
            name="login"
            options={{ title: 'Login', headerShown: false }}
          />
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
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default RootLayout;
