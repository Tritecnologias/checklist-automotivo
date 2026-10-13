import '../global.css';

import React, { Component, useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { queryClient } from '@/lib/queryClient';

// ─── Error Boundary Raiz ───────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[RootErrorBoundary] Erro capturado:', error, errorInfo);
  }

  handleReset = async () => {
    try {
      await AsyncStorage.clear();
    } catch {}
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <StatusBar style="light" />
          <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginBottom: 8 }}>
            Ocorreu uma falha no aplicativo
          </Text>
          <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', marginBottom: 20 }}>
            {this.state.error?.message || 'Erro inesperado ao inicializar a interface.'}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{ backgroundColor: '#2563eb', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, marginBottom: 12, width: '100%', alignItems: 'center' }}
          >
            <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 15 }}>Tentar Novamente</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={this.handleReset}
            style={{ backgroundColor: '#334155', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, width: '100%', alignItems: 'center' }}
          >
            <Text style={{ color: '#cbd5e1', fontWeight: '600', fontSize: 14 }}>Limpar Cache e Reiniciar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Guard de Navegação ───────────────────────────────────────────────────────

function AuthGate() {
  const { token, needsTenantSelection, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const currentSegment = (segments[0] as string | undefined) || '';
    const inLogin = currentSegment === 'login';
    const inTenantSelect = currentSegment === 'select-tenant';

    if (!token) {
      if (!inLogin) {
        router.replace('/login');
      }
    } else if (needsTenantSelection) {
      if (!inTenantSelect) {
        router.replace('/select-tenant' as any);
      }
    } else {
      if (inLogin || inTenantSelect) {
        router.replace('/');
      }
    }
  }, [token, needsTenantSelection, isLoading, segments]);

  return null;
}

// ─── Conteúdo Principal com Splash/Loading ────────────────────────────────────

function RootNavigation() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isLoading, token } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0f2744',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <StatusBar style="light" />
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔧</Text>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={{ color: '#f8fafc', marginTop: 18, fontSize: 18, fontWeight: '700' }}>
          Checklist Automotivo
        </Text>
        <Text style={{ color: '#94a3b8', marginTop: 6, fontSize: 13 }}>
          Iniciando ambiente…
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AuthGate />
      <Stack
        initialRouteName={!token ? 'login' : 'index'}
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
          name="select-tenant"
          options={{ title: 'Selecionar Loja', headerShown: false }}
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
    </>
  );
}

// ─── Raiz ─────────────────────────────────────────────────────────────────────

function RootLayout() {
  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigation />
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}

export default RootLayout;
