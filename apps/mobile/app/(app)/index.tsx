import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { CalendarPlus, Clock, PawPrint, Scissors, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppointmentCard, Loading, SectionTitle } from "@/components/appointments";
import { PetAvatar } from "@/components/pets";
import { TrackingCard } from "@/components/tracking";
import { Badge, Body, Brand, Button, Card, Notice, Screen } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { upcoming } from "@/lib/labels";
import { MY_APPOINTMENTS, MY_PETS, MY_TRACKING } from "@/lib/queries";
import { useSession, useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

interface Shortcut {
  icon: LucideIcon;
  label: string;
  href: Href;
}

const SHORTCUTS: Shortcut[] = [
  { icon: CalendarPlus, label: "Solicitar cita", href: "/citas/nueva" },
  { icon: PawPrint, label: "Mis mascotas", href: "/mascotas" },
  { icon: Clock, label: "Horario", href: "/clinica" },
];

export default function HomeScreen() {
  const session = useSession();
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
  // Baños y cirugías en curso: se refresca solo cada pocos segundos.
  const tracking = useQuery({
    queryKey: MY_TRACKING,
    queryFn: () => unwrap(api.GET("/api/v1/me/tracked-services")),
  });

  if (session.status !== "authenticated") {
    return null;
  }
  const { user } = session;
  const firstName = user.full_name.split(" ")[0] ?? "";
  const pending = appointments.data ? upcoming(appointments.data) : [];
  const next = pending[0];
  const hasPets = (pets.data?.length ?? 0) > 0;
  const active = (tracking.data ?? []).filter((t) => t.status !== "handed_over");

  return (
    <Screen
      tabs
      onRefresh={() => Promise.all([pets.refetch(), appointments.refetch(), tracking.refetch()])}
    >
      <View style={styles.topBar}>
        <Brand />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sesión de ${user.full_name}`}
          onPress={() => router.navigate("/cuenta")}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing(1) }}>
        <Text accessibilityRole="header" style={styles.hello}>
          Hola, {firstName}
        </Text>
        <Body muted>Aquí verás el cuidado de tus mascotas.</Body>
      </View>

      {/* En la veterinaria ahora */}
      {active.length > 0 ? (
        <View style={{ gap: spacing(2.5) }}>
          <SectionTitle>En la veterinaria</SectionTitle>
          {active.map((service) => (
            <TrackingCard key={service.id} service={service} />
          ))}
        </View>
      ) : null}

      {/* Próxima cita */}
      <View style={{ gap: spacing(2.5) }}>
        <View style={styles.sectionHeader}>
          <SectionTitle>Próxima cita</SectionTitle>
          {pending.length > 1 ? <Text style={styles.more}>+{pending.length - 1} más</Text> : null}
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
          </Card>
        )}
      </View>

      {/* Accesos rápidos */}
      <View style={styles.shortcuts}>
        {SHORTCUTS.map(({ icon: Icon, label, href }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => router.navigate(href)}
            style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.shortcutIcon}>
              <Icon size={20} color={colors.primary} />
            </View>
            <Text style={styles.shortcutText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Mascotas */}
      <View style={{ gap: spacing(2.5) }}>
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
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing(3) }}
          >
            {pets.data.map((pet) => (
              <Pressable
                key={pet.id}
                accessibilityRole="button"
                accessibilityLabel={`Perfil de ${pet.name}`}
                onPress={() => router.navigate(`/mascotas/${pet.id}`)}
                style={({ pressed }) => [styles.pet, pressed && { opacity: 0.85 }]}
              >
                <PetAvatar pet={pet} size={64} />
                <Text style={styles.petName} numberOfLines={1}>
                  {pet.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {active.length === 0 ? (
        <View style={styles.soon}>
          <Scissors size={18} color={colors.primary} />
          <Body muted style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
            Cuando dejes a tu mascota para un baño o una cirugía, aquí verás su avance en vivo.
          </Body>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.display, fontSize: 17, color: colors.primaryForeground },
  hello: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.foreground },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  more: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.mutedForeground },
  shortcuts: { flexDirection: "row", gap: spacing(3) },
  shortcut: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(2),
    alignItems: "center",
    gap: spacing(2),
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.foreground,
    textAlign: "center",
  },
  highlight: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.panel,
    padding: spacing(5),
    gap: spacing(2.5),
  },
  highlightTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: colors.surfaceStrongForeground,
  },
  highlightText: { color: "rgba(238,247,246,0.8)" },
  pet: {
    width: 96,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing(3),
    alignItems: "center",
    gap: spacing(2),
  },
  petName: { fontFamily: fonts.display, fontSize: 16, color: colors.foreground },
  soon: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.field,
    padding: spacing(3),
  },
});
