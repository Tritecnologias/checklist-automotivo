import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import { useAuth } from './AuthContext'
import type { ConfigSistema } from '../types'

interface ConfigContextValue {
  logoUrl: string | null
  nomeSistema: string
  logoSize: 'sm' | 'md' | 'lg' | 'xl'
  logoLayout: 'inline' | 'stacked'
  tenantId?: number | null
  isLoading: boolean
  refetchConfig: () => void
}

const ConfigContext = createContext<ConfigContextValue>({
  logoUrl: null,
  nomeSistema: '4Rodas ERP',
  logoSize: 'lg',
  logoLayout: 'inline',
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
  const logoSize = (data?.logo_size as 'sm' | 'md' | 'lg' | 'xl') || 'lg'
  const logoLayout = (data?.logo_layout as 'inline' | 'stacked') || 'inline'

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
        logoSize,
        logoLayout,
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
