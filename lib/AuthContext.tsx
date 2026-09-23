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
    const payload = JSON.parse(atob(token.split('.')[1]));
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
    AsyncStorage.getItem(AUTH_TOKEN_KEY)
      .then(async (t) => {
        if (t) {
          setToken(t);
          try {
            const data = await authApi.me();
            setUser(data.user);
            setTenants(data.tenants);
          } catch {
            await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
            setToken(null);
          }
        }
      })
      .finally(() => setIsLoading(false));
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
