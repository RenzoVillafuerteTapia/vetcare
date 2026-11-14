import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { KeyRound, LogOut, UserRoundPen } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Body, Card, ListRow, PageHeader, Screen } from "@/components/ui";
import { useSession, useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

export default function AccountScreen() {
  const session = useSession();
  const manager = useSessionManager();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  if (session.status !== "authenticated") return null;
  const { user } = session;

  return (
    <Screen tabs>
      <PageHeader title="Cuenta" />
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.full_name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: spacing(0.5) }}>
          <Text style={styles.name}>{user.full_name}</Text>
          <Body muted style={{ fontSize: 14 }}>
            {user.email}
          </Body>
        </View>
      </Card>

      <Card style={{ gap: 0, paddingVertical: spacing(2) }}>
        <ListRow
          icon={UserRoundPen}
          label="Mis datos de contacto"
          detail="Teléfono y dirección para que la veterinaria te ubique."
          onPress={() => router.push("/cuenta/datos")}
        />
        <ListRow
          icon={KeyRound}
          label="Cambiar contraseña"
          detail="Cierra la sesión en tus otros dispositivos."
          onPress={() => router.push("/cuenta/contrasena")}
        />
        <ListRow
          icon={LogOut}
          label={leaving ? "Cerrando sesión…" : "Cerrar sesión"}
          tone="destructive"
          onPress={
            leaving
              ? undefined
              : () => {
                  setLeaving(true);
                  void manager.logout();
                }
          }
        />
      </Card>

      <Text style={styles.version}>VetCare {Constants.expoConfig?.version ?? ""}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.display, fontSize: 24, color: colors.primaryForeground },
  name: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
  version: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
