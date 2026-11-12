import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Loading } from "@/components/appointments";
import { PetAvatar } from "@/components/pets";
import { Body, Button, Card, Notice, PageHeader, Screen } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { SPECIES_LABELS, upcoming } from "@/lib/labels";
import { MY_APPOINTMENTS, MY_PETS } from "@/lib/queries";
import { formatDate } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

export default function PetsScreen() {
  const { api } = useSessionManager();
  const router = useRouter();
  const pets = useQuery({
    queryKey: MY_PETS,
    queryFn: () => unwrap(api.GET("/api/v1/me/pets")),
  });
  const appointments = useQuery({
    queryKey: MY_APPOINTMENTS,
    queryFn: () => unwrap(api.GET("/api/v1/me/appointments")),
  });
  const next = upcoming(appointments.data ?? []);

  return (
    <Screen tabs>
      <PageHeader title="Mascotas" subtitle="Las mascotas de las que eres dueño o responsable." />

      {pets.isPending ? (
        <Loading label="Cargando tus mascotas…" />
      ) : pets.isError ? (
        <View style={{ gap: spacing(3) }}>
          <Notice tone="error">{errorMessage(pets.error)}</Notice>
          <Button label="Reintentar" variant="outline" onPress={() => void pets.refetch()} />
        </View>
      ) : pets.data.length === 0 ? (
        <Card>
          <Body muted>
            Todavía no hay mascotas vinculadas. Pide en la veterinaria que te registren como su
            dueño o responsable.
          </Body>
        </Card>
      ) : (
        <View style={{ gap: spacing(3) }}>
          {pets.data.map((pet) => {
            const appointment = next.find((a) => a.pet_id === pet.id);
            return (
              <Pressable
                key={pet.id}
                accessibilityRole="button"
                accessibilityLabel={`Perfil de ${pet.name}`}
                onPress={() => router.push(`/mascotas/${pet.id}`)}
                style={({ pressed }) => [styles.pet, pressed && { opacity: 0.85 }]}
              >
                <PetAvatar pet={pet} />
                <View style={{ flex: 1, gap: spacing(0.5) }}>
                  <Text style={styles.name}>{pet.name}</Text>
                  <Body muted style={{ fontSize: 14 }}>
                    {SPECIES_LABELS[pet.species]}
                    {pet.breed ? ` · ${pet.breed}` : ""}
                  </Body>
                  {pet.status !== "active" ? (
                    <Text style={styles.hint}>
                      {pet.status === "deceased" ? "Fallecida" : "Transferida"}
                    </Text>
                  ) : appointment ? (
                    <Text style={styles.hint}>Próxima cita: {formatDate(appointment.start)}</Text>
                  ) : null}
                </View>
                <ChevronRight size={20} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pet: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing(4),
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(4),
  },
  name: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
  hint: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.primary },
});
