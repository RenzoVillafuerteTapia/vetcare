import { Tabs } from "expo-router";
import {
  CalendarDays,
  House,
  PawPrint,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import type { ColorValue } from "react-native";

import { colors, fonts } from "@/theme/tokens";

function icon(Icon: LucideIcon) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return (
      <Icon color={typeof color === "string" ? color : colors.mutedForeground} size={size - 2} />
    );
  }
  return TabIcon;
}

/**
 * Barra inferior con cinco destinos (el máximo recomendado). Mascotas, Citas y Cuenta tienen
 * su propia pila, así la barra sigue visible al entrar a un detalle.
 */
export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.sidebar },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: icon(House) }} />
      <Tabs.Screen name="mascotas" options={{ title: "Mascotas", tabBarIcon: icon(PawPrint) }} />
      <Tabs.Screen name="citas" options={{ title: "Citas", tabBarIcon: icon(CalendarDays) }} />
      <Tabs.Screen name="clinica" options={{ title: "Clínica", tabBarIcon: icon(Stethoscope) }} />
      <Tabs.Screen name="cuenta" options={{ title: "Cuenta", tabBarIcon: icon(UserRound) }} />
    </Tabs>
  );
}
