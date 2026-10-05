import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 0ms para que os dados nunca fiquem "presos" como eternamente novos
      // Permite que qualquer transição de tela ou foco revalide em background via AJAX
      staleTime: 0,
      // Mantém o cache por 10 minutos para renderização instantânea (sem tela em branco)
      gcTime: 10 * 60_000,
      // Revalida automaticamente ao focar a aba/janela do navegador
      refetchOnWindowFocus: true,
      // Revalida automaticamente ao reconectar à internet
      refetchOnReconnect: true,
      // Sempre faz busca em background ao montar qualquer componente
      refetchOnMount: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})
