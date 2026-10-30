import { Fredoka_400Regular, Fredoka_500Medium } from "@expo-google-fonts/fredoka";
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { API_URL } from "@/lib/env";
import { createQueryClient } from "@/lib/query-client";
import { useSession } from "@/session/context";
import { SessionProvider } from "@/session/provider";
import { SessionManager } from "@/session/session";
import { secureTokenStore } from "@/session/token-store";
import { colors } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session] = useState(() => new SessionManager(API_URL, secureTokenStore));
  const [queryClient] = useState(() => createQueryClient(session));

  return (
    <SafeAreaProvider>
      <SessionProvider manager={session}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RootNavigator />
        </QueryClientProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Las rutas privadas solo existen con sesión; el splash se mantiene hasta saberlo. */
function RootNavigator() {
  const session = useSession();
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  const ready = (fontsLoaded || fontError !== null) && session.status !== "loading";

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const authenticated = session.status === "authenticated";
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.sidebar } }}
    >
      <Stack.Protected guard={authenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!authenticated}>
        <Stack.Screen name="login" />
        <Stack.Screen name="recuperar-contrasena" />
      </Stack.Protected>
    </Stack>
  );
}
