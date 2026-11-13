import { Tabs } from "expo-router";
import {
  CalendarDays,
  House,
  PawPrint,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/theme/tokens";

function icon(Icon: LucideIcon) {
  function TabIcon({ focused }: { focused: boolean }) {
    // La pestaña activa es un círculo amarillo; las demás, solo el ícono.
    return (
      <View style={[styles.icon, focused && styles.iconActive]}>
        <Icon
          size={22}
          strokeWidth={focused ? 2.4 : 2}
          color={focused ? colors.accentForeground : colors.mutedForeground}
        />
      </View>
    );
  }
  return TabIcon;
}

/**
 * Barra inferior flotante en forma de píldora, con cinco destinos (el máximo recomendado). Los
 * nombres no se muestran, pero los lectores de pantalla los anuncian. Mascotas, Citas y Cuenta
 * tienen su propia pila, así la barra sigue visible al entrar a un detalle.
 */
export default function AppLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      // La barra flota con su propio margen: no suma el área segura dentro de su alto.
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.accentForeground,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: [styles.bar, { marginBottom: Math.max(insets.bottom, 12) }],
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.iconSlot,
        sceneStyle: { backgroundColor: colors.background },
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

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 20,
    height: 72,
    paddingTop: 0,
    paddingBottom: 0,
    borderRadius: 999,
    borderTopWidth: 0,
    backgroundColor: colors.card,
    shadowColor: "#1d2329",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  item: { height: 72, alignItems: "center", justifyContent: "center", paddingVertical: 0 },
  iconSlot: { width: 52, height: 52, marginTop: 0, marginBottom: 0 },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { backgroundColor: colors.accent },
});
