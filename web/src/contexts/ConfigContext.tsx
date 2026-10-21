import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import { useAuth } from './AuthContext'
import type { ConfigSistema } from '../types'

interface ConfigContextValue {
  logoUrl: string | null
  nomeSistema: string
  tenantId?: number | null
  isLoading: boolean
  refetchConfig: () => void
}

const ConfigContext = createContext<ConfigContextValue>({
  logoUrl: null,
  nomeSistema: '4Rodas ERP',
  isLoading: false,
  refetchConfig: () => {},
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, currentTenant } = useAuth()
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery<ConfigSistema>({
    queryKey: ['system-config', currentTenant?.id, isAuthenticated],
    queryFn: async () => {
      if (isAuthenticated) {
        try {
          return await erpApi.obterConfigSistema()
        } catch {
          return await erpApi.obterConfigPublica()
        }
      }
      return await erpApi.obterConfigPublica()
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  })

  const logoUrl = data?.logo_url || null
  const nomeSistema = data?.nome_sistema || '4Rodas ERP'

  // Atualiza favicon dinamicamente se houver logo customizada
  useEffect(() => {
    if (logoUrl) {
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      if (link) {
        link.href = logoUrl
      }
    }
  }, [logoUrl])

  return (
    <ConfigContext.Provider
      value={{
        logoUrl,
        nomeSistema,
        tenantId: data?.tenant_id,
        isLoading,
        refetchConfig: () => {
          qc.invalidateQueries({ queryKey: ['system-config'] })
          refetch()
        },
      }}
    >
      {children}
    </ConfigContext.Provider>
  )
}

export function useSystemConfig() {
  return useContext(ConfigContext)
}
