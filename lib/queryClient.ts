import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 min — catálogo não muda a todo instante
      retry: 2,
      refetchOnWindowFocus: false,  // mecânico não fica trocando de app
    },
    mutations: {
      retry: 1,
    },
  },
});
