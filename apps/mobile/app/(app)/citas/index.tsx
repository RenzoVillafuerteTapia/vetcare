import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CalendarPlus } from "lucide-react-native";
import { View } from "react-native";

import { AppointmentCard, BackLink, Loading, SectionTitle } from "@/components/appointments";
import { Body, Button, Card, Heading, Notice, Screen } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { past, upcoming } from "@/lib/labels";
import { MY_APPOINTMENTS } from "@/lib/queries";
import { useSessionManager } from "@/session/context";
import { spacing } from "@/theme/tokens";

export default function AppointmentsScreen() {
  const { api } = useSessionManager();
  const router = useRouter();
  const appointments = useQuery({
    queryKey: MY_APPOINTMENTS,
    queryFn: () => unwrap(api.GET("/api/v1/me/appointments")),
  });

  const next = upcoming(appointments.data ?? []);
  const previous = past(appointments.data ?? []);

  return (
    <Screen>
      <BackLink label="Inicio" />
      <View style={{ gap: spacing(1.5) }}>
        <Heading>Tus citas</Heading>
        <Body muted>Las próximas y las de los últimos 90 días.</Body>
      </View>
      <Button
        label="Solicitar una cita"
        icon={CalendarPlus}
        onPress={() => router.push("/citas/nueva")}
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
      ) : (
        <>
          <View style={{ gap: spacing(3) }}>
            <SectionTitle>Próximas</SectionTitle>
            {next.length === 0 ? (
              <Card>
                <Body muted>No tienes citas próximas.</Body>
              </Card>
            ) : (
              next.map((a) => <AppointmentCard key={a.id} appointment={a} />)
            )}
          </View>
          {previous.length > 0 ? (
            <View style={{ gap: spacing(3) }}>
              <SectionTitle>Anteriores</SectionTitle>
              {previous.map((a) => (
                <AppointmentCard key={a.id} appointment={a} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
