import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  CalendarPlus,
  ChevronRight,
  LogOut,
  PawPrint,
  Pill,
  Scissors,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppointmentCard, Loading, SectionTitle } from "@/components/appointments";
import { PetAvatar } from "@/components/pets";
import { Badge, Body, Brand, Button, Card, Heading, Notice, Screen } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { SPECIES_LABELS, upcoming } from "@/lib/labels";
import { MY_APPOINTMENTS, MY_PETS } from "@/lib/queries";
import { useSession, useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

/** Lo que llega en las fases siguientes. Sin datos de ejemplo. */
const COMING: { icon: LucideIcon; title: string; description: string; phase: string }[] = [
  {
    icon: Scissors,
    title: "Servicios en vivo",
    description: "El avance del baño o la cirugía de tu mascota, etapa por etapa.",
    phase: "Fase 3",
  },
  {
    icon: Pill,
    title: "Cuidados en casa",
    description: "Medicamentos e indicaciones de la veterinaria, con recordatorios.",
    phase: "Fase 4",
  },
];

export default function HomeScreen() {
  const session = useSession();
  const manager = useSessionManager();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const { api } = manager;

  const pets = useQuery({
    queryKey: MY_PETS,
    queryFn: () => unwrap(api.GET("/api/v1/me/pets")),
  });
  const appointments = useQuery({
    queryKey: MY_APPOINTMENTS,
    queryFn: () => unwrap(api.GET("/api/v1/me/appointments")),
  });

  if (session.status !== "authenticated") {
    return null;
  }
  const { user } = session;
  const firstName = user.full_name.split(" ")[0] ?? "";
  const next = appointments.data ? upcoming(appointments.data)[0] : undefined;
  const hasPets = (pets.data?.length ?? 0) > 0;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Brand />
        <View style={styles.avatar} accessibilityLabel={`Sesión de ${user.full_name}`}>
          <Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text>
        </View>
      </View>

      <View style={{ gap: spacing(1.5) }}>
        <Heading>Hola, {firstName}</Heading>
        <Body muted>Aquí verás el cuidado de tus mascotas.</Body>
      </View>

      {/* Próxima cita */}
      <View style={{ gap: spacing(3) }}>
        <View style={styles.sectionHeader}>
          <SectionTitle>Próxima cita</SectionTitle>
          {appointments.data && appointments.data.length > 0 ? (
            <Button label="Ver todas" variant="ghost" onPress={() => router.push("/citas")} />
          ) : null}
        </View>
        {appointments.isPending ? (
          <Loading label="Cargando tus citas…" />
        ) : appointments.isError ? (
          <Notice tone="error">{errorMessage(appointments.error)}</Notice>
        ) : next ? (
          <AppointmentCard appointment={next} />
        ) : (
          <Card>
            <Body muted>
              {hasPets
                ? "No tienes citas próximas. Solicita una y la veterinaria la confirmará."
                : "Cuando tengas mascotas vinculadas podrás solicitar citas desde aquí."}
            </Body>
            {hasPets ? (
              <Button
                label="Solicitar una cita"
                icon={CalendarPlus}
                onPress={() => router.push("/citas/nueva")}
              />
            ) : null}
          </Card>
        )}
      </View>

      {/* Mascotas */}
      <View style={{ gap: spacing(3) }}>
        <SectionTitle>Tus mascotas</SectionTitle>
        {pets.isPending ? (
          <Loading label="Cargando tus mascotas…" />
        ) : pets.isError ? (
          <View style={{ gap: spacing(3) }}>
            <Notice tone="error">{errorMessage(pets.error)}</Notice>
            <Button label="Reintentar" variant="outline" onPress={() => void pets.refetch()} />
          </View>
        ) : pets.data.length === 0 ? (
          <View style={styles.highlight}>
            <Badge glass>Tus mascotas</Badge>
            <Text style={styles.highlightTitle} accessibilityRole="header">
              Todavía no hay mascotas vinculadas
            </Text>
            <Body style={styles.highlightText}>
              Pide en la veterinaria que te registren como dueño o responsable de tu mascota. Al
              hacerlo, aparecerá aquí con su perfil y sus citas.
            </Body>
            <PawPrint
              size={180}
              strokeWidth={1.25}
              color="rgba(255,255,255,0.07)"
              style={styles.highlightPaw}
            />
          </View>
        ) : (
          pets.data.map((pet) => (
            <Pressable
              key={pet.id}
              accessibilityRole="button"
              accessibilityLabel={`Perfil de ${pet.name}`}
              onPress={() => router.push(`/mascotas/${pet.id}`)}
              style={({ pressed }) => [styles.pet, pressed && { opacity: 0.85 }]}
            >
              <PetAvatar pet={pet} />
              <View style={{ flex: 1, gap: spacing(0.5) }}>
                <Text style={styles.petName}>{pet.name}</Text>
                <Body muted style={{ fontSize: 14 }}>
                  {SPECIES_LABELS[pet.species]}
                  {pet.breed ? ` · ${pet.breed}` : ""}
                </Body>
              </View>
              <ChevronRight size={20} color={colors.mutedForeground} />
            </Pressable>
          ))
        )}
      </View>

      <View style={{ gap: spacing(3) }}>
        <SectionTitle>En preparación</SectionTitle>
        {COMING.map(({ icon: Icon, title, description, phase }) => (
          <Card key={title} style={styles.moduleCard}>
            <View style={styles.moduleHeader}>
              <View style={styles.moduleIcon}>
                <Icon size={20} color={colors.primary} />
              </View>
              <Badge>{phase}</Badge>
            </View>
            <Text style={styles.moduleTitle}>{title}</Text>
            <Body muted style={{ fontSize: 14 }}>
              {description}
            </Body>
          </Card>
        ))}
      </View>

      <Card>
        <Text style={styles.moduleTitle}>{user.full_name}</Text>
        <Body muted>{user.email}</Body>
        <Button
          label="Cerrar sesión"
          variant="outline"
          icon={LogOut}
          loading={leaving}
          onPress={() => {
            setLeaving(true);
            void manager.logout();
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.display, fontSize: 18, color: colors.primaryForeground },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  highlight: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.panel,
    padding: spacing(6),
    gap: spacing(3),
    overflow: "hidden",
  },
  highlightTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: colors.surfaceStrongForeground,
  },
  highlightText: { color: "rgba(238,247,246,0.8)" },
  highlightPaw: {
    position: "absolute",
    right: -40,
    bottom: -50,
    transform: [{ rotate: "-18deg" }],
  },
  pet: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing(4),
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(4),
  },
  petName: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
  moduleCard: { gap: spacing(2) },
  moduleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moduleIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.foreground },
});
