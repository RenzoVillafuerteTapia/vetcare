import { Stack } from "expo-router";

import { colors } from "@/theme/tokens";

// Al abrir un detalle desde otra pestaña, la lista queda debajo para volver a ella.
export const unstable_settings = { anchor: "index" };

export default function TabStackLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.sidebar } }}
    />
  );
}
