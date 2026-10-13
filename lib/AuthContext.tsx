import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, AUTH_TOKEN_KEY, type LoginResult } from './api';

type Tenant = LoginResult['tenants'][number];

interface AuthContextValue {
  token: string | null;
  user: LoginResult['user'] | null;
  tenants: LoginResult['tenants'];
  activeTenant: Tenant | null;
  needsTenantSelection: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectTenant: (tenant: Tenant) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwtTenantId(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    let jsonStr = '';
    if (typeof atob === 'function') {
      try {
        jsonStr = atob(base64);
      } catch {
        jsonStr = '';
      }
    }
    if (!jsonStr) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      for (let i = 0; i < base64.length; i += 4) {
        const b1 = chars.indexOf(base64[i]);
        const b2 = chars.indexOf(base64[i + 1]);
        const b3 = chars.indexOf(base64[i + 2]);
        const b4 = chars.indexOf(base64[i + 3]);
        if (b1 === -1 || b2 === -1) break;
        jsonStr += String.fromCharCode((b1 << 2) | (b2 >> 4));
        if (b3 !== 64 && b3 !== -1) jsonStr += String.fromCharCode(((b2 & 15) << 4) | (b3 >> 2));
        if (b4 !== 64 && b4 !== -1) jsonStr += String.fromCharCode(((b3 & 3) << 6) | b4);
      }
    }
    const payload = JSON.parse(jsonStr);
    return payload.tenantId ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<LoginResult['user'] | null>(null);
  const [tenants, setTenants] = useState<LoginResult['tenants']>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      try {
        const t = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        if (!t) {
          if (isMounted) setIsLoading(false);
          return;
        }

        if (isMounted) setToken(t);

        try {
          // Timeout estrito de 4s para nunca prender a inicialização em tela branca
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 4000)
          );
          const data = await Promise.race([authApi.me(), timeoutPromise]);
          if (isMounted) {
            setUser(data.user);
            setTenants(data.tenants);
          }
        } catch (err: any) {
          console.warn('[AuthContext] Validação inicial de token:', err?.message);
          const msg = String(err?.message || '');
          if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('inválido')) {
            await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
            if (isMounted) {
              setToken(null);
              setUser(null);
              setTenants([]);
            }
          }
        }
      } catch (storageErr) {
        console.warn('[AuthContext] Erro ao acessar AsyncStorage:', storageErr);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeTenantId = token ? decodeJwtTenantId(token) : null;
  const activeTenant = tenants.find(t => t.id === activeTenantId) ?? null;
  const needsTenantSelection = tenants.length > 1 && activeTenant === null;

  async function login(email: string, password: string) {
    const result = await authApi.login(email, password);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
    setTenants(result.tenants);
  }

  async function logout() {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setUser(null);
    setTenants([]);
  }

  async function selectTenant(tenant: Tenant) {
    const result = await authApi.selectTenant(tenant.id);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, result.token);
    setToken(result.token);
  }

  return (
    <AuthContext.Provider value={{
      token, user, tenants, activeTenant,
      needsTenantSelection, isLoading,
      login, logout, selectTenant,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
