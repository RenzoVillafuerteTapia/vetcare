import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppointmentCard, Loading } from "@/components/appointments";
import { Body, Button, Card, Notice, PageHeader, Screen, Segmented } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { past, upcoming } from "@/lib/labels";
import { MY_APPOINTMENTS } from "@/lib/queries";
import { useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

type View_ = "proximas" | "historial";

export default function AppointmentsScreen() {
  const { api } = useSessionManager();
  const router = useRouter();
  const [view, setView] = useState<View_>("proximas");
  const appointments = useQuery({
    queryKey: MY_APPOINTMENTS,
    queryFn: () => unwrap(api.GET("/api/v1/me/appointments")),
  });

  const next = upcoming(appointments.data ?? []);
  const previous = past(appointments.data ?? []);
  const shown = view === "proximas" ? next : previous;

  return (
    <Screen tabs onRefresh={() => appointments.refetch()}>
      <PageHeader
        title="Citas"
        subtitle="Se actualizan solas. Desliza hacia abajo para ver lo último."
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Solicitar una cita"
            onPress={() => router.push("/citas/nueva")}
            style={({ pressed }) => [styles.add, pressed && { opacity: 0.85 }]}
          >
            <Plus size={18} color={colors.primaryForeground} />
            <Text style={styles.addText}>Solicitar</Text>
          </Pressable>
        }
      />
      <Segmented
        segments={[
          { value: "proximas", label: `Próximas (${next.length})` },
          { value: "historial", label: `Historial (${previous.length})` },
        ]}
        value={view}
        onChange={setView}
      />

      {appointments.isPending ? (
        <Loading label="Cargando tus citas…" />
      ) : appointments.isError ? (
        <View style={{ gap: spacing(3) }}>
          <Notice tone="error">{errorMessage(appointments.error)}</Notice>
          <Button
            label="Reintentar"
            variant="outline"
            onPress={() => void appointments.refetch()}
          />
        </View>
      ) : shown.length === 0 ? (
        <Card>
          <Body muted>
            {view === "proximas"
              ? "No tienes citas próximas. Solicita una y la veterinaria la confirmará."
              : "Todavía no hay citas anteriores."}
          </Body>
        </Card>
      ) : (
        <View style={{ gap: spacing(3) }}>
          {shown.map((a) => (
            <AppointmentCard key={a.id} appointment={a} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    minHeight: 40,
  },
  addText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.primaryForeground },
});
