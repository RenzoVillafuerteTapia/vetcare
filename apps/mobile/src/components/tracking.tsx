import { useRouter } from "expo-router";
import { Check, ChevronRight, Radio } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body } from "@/components/ui";
import type { TrackedService } from "@/lib/labels";
import { limaTime } from "@/lib/time";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

export const TRACKING_STATUS_LABELS: Record<TrackedService["status"], string> = {
  in_progress: "En curso",
  ready: "Lista para recoger",
  handed_over: "Entregada",
};

export function currentStageLabel(service: TrackedService): string {
  return service.stages.find((s) => s.state === "current")?.label ?? "";
}

/** Indicador de "en vivo": la pantalla se refresca sola mientras está abierta. */
export function LiveBadge({ live }: { live: boolean }) {
  return (
    <View style={[styles.live, !live && styles.liveOff]}>
      <Radio size={14} color={live ? colors.primary : colors.mutedForeground} />
      <Text style={[styles.liveText, !live && { color: colors.mutedForeground }]}>
        {live ? "En vivo" : "Finalizado"}
      </Text>
    </View>
  );
}

/** Barra de progreso por etapas: llena hasta la etapa actual. */
export function StageProgress({ service }: { service: TrackedService }) {
  return (
    <View style={styles.progress} accessibilityElementsHidden>
      {service.stages.map((stage) => (
        <View
          key={stage.code}
          style={[styles.progressStep, stage.state !== "pending" && styles.progressDone]}
        />
      ))}
    </View>
  );
}

/** Tarjeta del inicio: qué le están haciendo a la mascota ahora. */
export function TrackingCard({ service }: { service: TrackedService }) {
  const router = useRouter();
  const ready = service.status === "ready";
  const stage = currentStageLabel(service);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${service.pet_name}, ${service.service_name}: ${stage}`}
      onPress={() => router.push(`/citas/seguimiento/${service.id}`)}
      style={({ pressed }) => [styles.card, ready && styles.cardReady, pressed && { opacity: 0.9 }]}
    >
      <View style={{ flex: 1, gap: spacing(2) }}>
        <View style={styles.cardTop}>
          <Text style={[styles.eyebrow, ready && { color: colors.primaryForeground }]}>
            {ready ? "Lista para recoger" : "En curso ahora"}
          </Text>
          {!ready ? <LiveBadge live /> : null}
        </View>
        <Text style={[styles.cardTitle, ready && { color: colors.primaryForeground }]}>
          {service.pet_name} · {service.service_name}
        </Text>
        <Body style={ready ? { color: colors.primaryForeground } : undefined}>{stage}</Body>
        <StageProgress service={service} />
      </View>
      <ChevronRight size={20} color={ready ? colors.primaryForeground : colors.mutedForeground} />
    </Pressable>
  );
}

/** Línea de tiempo vertical: etapas hechas (con su hora), la actual y las que faltan. */
export function StageTimeline({ service }: { service: TrackedService }) {
  return (
    <View accessibilityRole="list" accessibilityLabel="Etapas">
      {service.stages.map((stage, index) => {
        const last = index === service.stages.length - 1;
        const done = stage.state === "done" || (stage.state === "current" && last);
        const current = stage.state === "current";
        return (
          <View
            key={stage.code}
            style={styles.row}
            accessibilityLabel={`${stage.label}: ${
              done ? "hecho" : current ? "en curso" : "pendiente"
            }${stage.reached_at ? `, ${limaTime(stage.reached_at)}` : ""}`}
          >
            <View style={styles.rail}>
              <View
                style={[styles.dot, done && styles.dotDone, current && !done && styles.dotCurrent]}
              >
                {done ? <Check size={14} color={colors.primaryForeground} /> : null}
              </View>
              {!last ? (
                <View style={[styles.line, stage.state === "done" && styles.lineDone]} />
              ) : null}
            </View>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.stage,
                  stage.state === "pending" && { color: colors.mutedForeground },
                  current && { fontFamily: fonts.bodyBold },
                ]}
              >
                {stage.label}
              </Text>
              <Text style={styles.time}>
                {stage.reached_at ? limaTime(stage.reached_at) : current ? "Ahora" : "Pendiente"}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  live: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1),
    alignSelf: "flex-start",
    backgroundColor: colors.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
  liveOff: { backgroundColor: colors.muted },
  liveText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  progress: { flexDirection: "row", gap: spacing(1.5) },
  progressStep: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  progressDone: { backgroundColor: colors.primary },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
  },
  cardReady: { backgroundColor: colors.primary, borderColor: colors.primary },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  cardTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.foreground },
  row: { flexDirection: "row", gap: spacing(3), minHeight: 52 },
  rail: { alignItems: "center", width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCurrent: { borderColor: colors.primary, borderWidth: 6 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: spacing(0.5) },
  lineDone: { backgroundColor: colors.primary },
  rowText: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing(0.5),
  },
  stage: { fontFamily: fonts.body, fontSize: 16, color: colors.foreground },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },
});
