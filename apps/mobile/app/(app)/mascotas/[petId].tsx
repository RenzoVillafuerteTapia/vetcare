import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarPlus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { AppointmentCard, BackLink, Loading, SectionTitle } from "@/components/appointments";
import { PetAvatar } from "@/components/pets";
import { Badge, Body, Button, Card, Heading, Notice, Screen } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { GUARDIAN_LABELS, SEX_LABELS, SPECIES_LABELS, upcoming } from "@/lib/labels";
import { MY_APPOINTMENTS, petKey } from "@/lib/queries";
import { formatCalendarDay, formatDate } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, spacing } from "@/theme/tokens";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Body>{value}</Body>
    </View>
  );
}

export default function PetScreen() {
  const { petId = "" } = useLocalSearchParams<{ petId: string }>();
  const { api } = useSessionManager();
  const router = useRouter();

  const pet = useQuery({
    queryKey: petKey(petId),
    queryFn: () =>
      unwrap(api.GET("/api/v1/pets/{pet_id}", { params: { path: { pet_id: petId } } })),
  });
  const appointments = useQuery({
    queryKey: MY_APPOINTMENTS,
    queryFn: () => unwrap(api.GET("/api/v1/me/appointments")),
  });

  if (pet.isPending) {
    return (
      <Screen>
        <BackLink />
        <Loading label="Cargando el perfil…" />
      </Screen>
    );
  }
  if (pet.isError) {
    return (
      <Screen>
        <BackLink />
        <Notice tone="error">{errorMessage(pet.error)}</Notice>
      </Screen>
    );
  }

  const data = pet.data;
  const latest = data.weights.at(-1);
  const next = upcoming(appointments.data ?? []).filter((a) => a.pet_id === data.id);
  const birth = data.birth_date
    ? `${formatCalendarDay(data.birth_date)}${data.birth_date_approximate ? " (aproximada)" : ""}`
    : "Sin registrar";

  return (
    <Screen>
      <BackLink label="Inicio" />

      <View style={styles.header}>
        <PetAvatar pet={data} size={96} />
        <View style={{ flex: 1, gap: spacing(1.5) }}>
          <Heading>{data.name}</Heading>
          <Body muted>
            {SPECIES_LABELS[data.species]}
            {data.breed ? ` · ${data.breed}` : ""} · {SEX_LABELS[data.sex]}
          </Body>
          {data.status === "active" ? null : (
            <Badge>{data.status === "deceased" ? "Fallecida" : "Transferida"}</Badge>
          )}
        </View>
      </View>

      <Card>
        <Fact label="Nacimiento" value={birth} />
        <Fact label="Color" value={data.color ?? "Sin registrar"} />
        <Fact
          label="Último peso"
          value={
            latest
              ? `${Number(latest.kilograms)} kg · ${formatDate(latest.measured_at)}`
              : "Sin registrar"
          }
        />
        {/* La API solo envía las alergias si la tutela permite ver información clínica. */}
        {data.allergies ? <Fact label="Alergias" value={data.allergies} /> : null}
      </Card>

      <View style={{ gap: spacing(3) }}>
        <SectionTitle>Próximas citas</SectionTitle>
        {appointments.isPending ? (
          <Loading label="Cargando citas…" />
        ) : next.length === 0 ? (
          <Body muted>{data.name} no tiene citas próximas.</Body>
        ) : (
          next.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))
        )}
        {data.status === "active" ? (
          <Button
            label={`Solicitar cita para ${data.name}`}
            icon={CalendarPlus}
            onPress={() => router.push(`/citas/nueva?petId=${data.id}`)}
          />
        ) : null}
      </View>

      <View style={{ gap: spacing(3) }}>
        <SectionTitle>Responsables</SectionTitle>
        <Card>
          {data.guardians.map((guardian) => (
            <View key={guardian.client_id} style={styles.guardian}>
              <Body style={{ flex: 1 }}>{guardian.full_name}</Body>
              <Text style={styles.factLabel}>{GUARDIAN_LABELS[guardian.kind]}</Text>
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  fact: { gap: spacing(0.5) },
  factLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.mutedForeground },
  guardian: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
});
