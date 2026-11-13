import { useQueryClient } from "@tanstack/react-query";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { ME } from "@/lib/queries";
import type { SessionManager, SessionState } from "@/session/session";

// Con la app abierta, el aviso también se muestra (y la lista de citas se refresca sola).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Proyecto de EAS al que pertenece el token. Sin él no hay avisos (p. ej. en desarrollo). */
export function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Pide permiso y devuelve el token de Expo del teléfono, o `null` si no se puede recibir avisos:
 * permiso negado, sin proyecto de EAS, o Expo Go en Android (que desde el SDK 53 no recibe
 * avisos remotos; hace falta una *development build*).
 */
export async function getPushToken(): Promise<string | null> {
  const projectId = easProjectId();
  const expoGoOnAndroid =
    Platform.OS === "android" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (!projectId || expoGoOnAndroid || Platform.OS === "web") {
    return null;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Avisos de tus citas",
      importance: AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") {
    return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

// Solo se abren pantallas conocidas: el contenido del aviso no decide a dónde navegar.
const APPOINTMENT_URL = /^\/citas\/[0-9a-f-]{36}$/i;

export function appointmentUrlOf(data: unknown): string | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === "string" && APPOINTMENT_URL.test(url) ? url : null;
}

/**
 * Avisos push con la sesión iniciada:
 * - registra el teléfono (y la sesión lo da de baja al cerrar sesión);
 * - al llegar un aviso, refresca los datos del cliente;
 * - al tocarlo, abre la cita (también si el aviso abrió la app).
 */
export function usePushNotifications(session: SessionManager, state: SessionState): void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authenticated = state.status === "authenticated";
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getPushToken();
        if (token && !cancelled) {
          await session.registerDevice(token, Platform.OS === "ios" ? "ios" : "android");
        }
      } catch {
        // Sin avisos la app funciona igual: las citas se actualizan solas al abrirla.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, session]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ME });
    });
    return () => received.remove();
  }, [queryClient]);

  useEffect(() => {
    if (!authenticated || !lastResponse) {
      return;
    }
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) {
      return;
    }
    handled.current = id;
    const url = appointmentUrlOf(lastResponse.notification.request.content.data);
    Notifications.clearLastNotificationResponse();
    if (url) {
      void queryClient.invalidateQueries({ queryKey: ME });
      router.push(url as never);
    }
  }, [authenticated, lastResponse, queryClient, router]);
}
