import { focusManager, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";

import type { SessionManager } from "@/session/session";

import { ApiError } from "./api-error";
import { ME } from "./queries";

/**
 * Cada cuánto se vuelven a pedir las citas mientras la app está abierta y en primer plano: así
 * se ve cuando la veterinaria confirma, reprograma o cancela, sin salir de la pantalla. En
 * segundo plano no se consulta (TanStack Query pausa el intervalo sin foco).
 */
export const APPOINTMENTS_REFRESH_MS = 30_000;

/** El seguimiento de un baño o una cirugía se ve "en vivo": se vuelve a pedir cada 10 s. */
export const TRACKING_REFRESH_MS = 10_000;

/** Un 401 en cualquier consulta intenta renovar la sesión; los errores 4xx no se reintentan. */
export function createQueryClient(session: SessionManager): QueryClient {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      void session.handleUnauthorized();
    }
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
  // La lista de citas y el detalle de cada una (`["me", "appointment", id]`).
  for (const key of [
    [...ME, "appointments"],
    [...ME, "appointment"],
  ]) {
    client.setQueryDefaults(key, { refetchInterval: APPOINTMENTS_REFRESH_MS });
  }
  for (const key of [
    [...ME, "tracking"],
    [...ME, "tracked"],
    [...ME, "appointment-tracking"],
  ]) {
    client.setQueryDefaults(key, { refetchInterval: TRACKING_REFRESH_MS });
  }
  return client;
}

/**
 * En React Native no hay eventos de foco de ventana: la app "tiene foco" mientras está activa.
 * Al volver a ella se refrescan los datos vencidos, y los intervalos se pausan en segundo plano.
 */
export function useAppFocus(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => subscription.remove();
  }, []);
}
