import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import type { SessionManager } from "@/features/auth/session";
import { ApiError } from "@/lib/api-error";

/** Un 401 en cualquier consulta intenta renovar la sesión; los errores 4xx no se reintentan. */
export function createQueryClient(session: SessionManager): QueryClient {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      void session.handleUnauthorized();
    }
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
