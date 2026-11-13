import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarClock, X } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BackLink, Loading, StatusBadge } from "@/components/appointments";
import { Body, Button, Card, Heading, Notice, Screen, TextField } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { clientCanChange } from "@/lib/labels";
import { appointmentKey, ME } from "@/lib/queries";
import { formatSlot } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, spacing } from "@/theme/tokens";

/** Aviso que deja la pantalla anterior al volver aquí después de un cambio. */
const NOTICES: Record<string, string> = {
  solicitada: "Solicitud enviada. La veterinaria la confirmará y te avisaremos.",
  reprogramada: "Nuevo horario solicitado. La veterinaria lo confirmará.",
};

export default function AppointmentScreen() {
  const { appointmentId = "", aviso } = useLocalSearchParams<{
    appointmentId: string;
    aviso?: string;
  }>();
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const appointment = useQuery({
    queryKey: appointmentKey(appointmentId),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/appointments/{appointment_id}", {
          params: { path: { appointment_id: appointmentId } },
        }),
      ),
  });

  const cancel = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/appointments/{appointment_id}/cancel", {
          params: { path: { appointment_id: appointmentId } },
          body: { reason: reason.trim() || null },
        }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(appointmentKey(appointmentId), updated);
      setCancelling(false);
      await queryClient.invalidateQueries({ queryKey: ME });
    },
  });

  if (appointment.isPending) {
    return (
      <Screen tabs>
        <BackLink />
        <Loading label="Cargando la cita…" />
      </Screen>
    );
  }
  if (appointment.isError) {
    return (
      <Screen tabs>
        <BackLink />
        <Notice tone="error">{errorMessage(appointment.error)}</Notice>
      </Screen>
    );
  }

  const data = appointment.data;
  const open = data.status === "requested" || data.status === "confirmed";
  const canChange = clientCanChange(data);
  const notice = aviso ? NOTICES[aviso] : undefined;

  return (
    <Screen tabs>
      <BackLink />

      {notice && !cancel.isSuccess ? <Notice tone="success">{notice}</Notice> : null}
      {cancel.isSuccess ? <Notice tone="success">Cancelaste la cita.</Notice> : null}

      <View style={{ gap: spacing(2) }}>
        <StatusBadge status={data.status} />
        <Heading style={{ fontSize: 28, lineHeight: 32 }}>
          {data.pet_name} · {data.service_name}
        </Heading>
        <Body muted>{formatSlot(data.start, data.end)}</Body>
      </View>

      <Card>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Motivo</Text>
          <Body>{data.reason ?? "Sin detalle"}</Body>
        </View>
        {data.cancellation_reason ? (
          <View style={styles.fact}>
            <Text style={styles.factLabel}>Motivo de la cancelación</Text>
            <Body>{data.cancellation_reason}</Body>
          </View>
        ) : null}
        {data.status === "requested" ? (
          <Body muted>La veterinaria todavía debe confirmar este horario.</Body>
        ) : null}
      </Card>

      {cancel.isError ? <Notice tone="error">{errorMessage(cancel.error)}</Notice> : null}

      {open && !canChange ? (
        <Notice tone="info">
          Para cambiar o cancelar con menos de 2 horas de anticipación, comunícate con la
          veterinaria.
        </Notice>
      ) : null}

      {open && canChange && !cancelling ? (
        <View style={{ gap: spacing(3) }}>
          <Button
            label="Reprogramar"
            variant="outline"
            icon={CalendarClock}
            onPress={() => router.push(`/citas/reprogramar/${data.id}`)}
          />
          <Button
            label="Cancelar cita"
            variant="ghost"
            icon={X}
            onPress={() => setCancelling(true)}
          />
        </View>
      ) : null}

      {cancelling ? (
        <Card>
          <Text style={styles.confirmTitle} accessibilityRole="header">
            ¿Cancelar la cita?
          </Text>
          <TextField
            label="Motivo (opcional)"
            value={reason}
            maxLength={300}
            onChangeText={setReason}
          />
          <Button
            label="Sí, cancelar la cita"
            loading={cancel.isPending}
            onPress={() => cancel.mutate()}
          />
          <Button label="No, mantenerla" variant="ghost" onPress={() => setCancelling(false)} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fact: { gap: spacing(0.5) },
  factLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.mutedForeground },
  confirmTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
});
