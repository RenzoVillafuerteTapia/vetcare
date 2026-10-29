import {
  CalendarClock,
  LogOut,
  PawPrint,
  Pill,
  Scissors,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, Body, Brand, Button, Card, Heading, Screen } from "@/components/ui";
import { useSession, useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

/** Lo que verá el dueño a medida que se habiliten los módulos. Sin datos de ejemplo. */
const UPCOMING: { icon: LucideIcon; title: string; description: string; phase: string }[] = [
  {
    icon: CalendarClock,
    title: "Tus citas",
    description: "Próximas citas, confirmaciones y solicitudes de nuevas citas.",
    phase: "Fase 2",
  },
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
  const [leaving, setLeaving] = useState(false);
  if (session.status !== "authenticated") {
    return null;
  }
  const { user } = session;
  const firstName = user.full_name.split(" ")[0] ?? "";

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

      <View style={styles.highlight}>
        <Badge glass>Tus mascotas</Badge>
        <Text style={styles.highlightTitle} accessibilityRole="header">
          Pronto aparecerán aquí
        </Text>
        <Body style={styles.highlightText}>
          Cuando la veterinaria vincule a tus mascotas con tu cuenta, verás su perfil, sus vacunas y
          los servicios en curso.
        </Body>
        <PawPrint
          size={180}
          strokeWidth={1.25}
          color="rgba(255,255,255,0.07)"
          style={styles.highlightPaw}
        />
      </View>

      <View style={{ gap: spacing(3) }}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          En preparación
        </Text>
        {UPCOMING.map(({ icon: Icon, title, description, phase }) => (
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
  highlight: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.panel,
    padding: spacing(6),
    gap: spacing(3),
    overflow: "hidden",
  },
  highlightTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.surfaceStrongForeground,
  },
  highlightText: { color: "rgba(238,247,246,0.8)" },
  highlightPaw: {
    position: "absolute",
    right: -40,
    bottom: -50,
    transform: [{ rotate: "-18deg" }],
  },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
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
