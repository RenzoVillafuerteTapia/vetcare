import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body } from "@/components/ui";
import { limaTime } from "@/lib/time";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

export interface GridSlot {
  start: string;
  /** Sin estado (respuestas antiguas): libre. */
  status?: "free" | "taken" | "too_soon";
}

const PERIODS = [
  { label: "Por la mañana", until: 12 },
  { label: "Por la tarde", until: 18 },
  { label: "Por la noche", until: 24 },
] as const;

function hourOf(slot: GridSlot): number {
  return Number(limaTime(slot.start).slice(0, 2));
}

/**
 * El día completo como la sala de un cine: cada horario es una butaca. Los ocupados se ven
 * oscuros y no se pueden tocar; los que caen dentro de la antelación mínima, atenuados.
 */
export function SlotGrid({
  slots,
  value,
  onChange,
}: {
  slots: GridSlot[];
  value: string;
  onChange: (start: string) => void;
}) {
  const free = slots.filter((s) => (s.status ?? "free") === "free").length;
  const hasTooSoon = slots.some((s) => s.status === "too_soon");
  const groups = PERIODS.map(({ label, until }, i) => {
    const from = i === 0 ? 0 : PERIODS[i - 1]!.until;
    return { label, items: slots.filter((s) => hourOf(s) >= from && hourOf(s) < until) };
  }).filter((g) => g.items.length > 0);

  return (
    <View style={{ gap: spacing(4) }}>
      <View style={styles.legend} accessibilityRole="summary">
        <Legend style={styles.seatFree} label="Libre" />
        <Legend style={styles.seatSelected} label="Elegido" />
        <Legend style={styles.seatTaken} label="Ocupado" />
        {hasTooSoon ? <Legend style={styles.seatSoon} label="Muy pronto" /> : null}
      </View>
      <Text style={styles.count}>
        {free === 0
          ? "No quedan horarios libres este día."
          : `${free} ${free === 1 ? "horario libre" : "horarios libres"} de ${slots.length}`}
      </Text>

      {groups.map((group) => (
        <View
          key={group.label}
          style={{ gap: spacing(2) }}
          accessibilityRole="radiogroup"
          accessibilityLabel={`Hora, ${group.label.toLowerCase()}`}
        >
          <Text style={styles.period}>{group.label}</Text>
          <View style={styles.grid}>
            {group.items.map((slot) => {
              const status = slot.status ?? "free";
              const selected = slot.start === value && status === "free";
              const time = limaTime(slot.start);
              return (
                <Pressable
                  key={slot.start}
                  accessibilityRole="radio"
                  accessibilityLabel={time}
                  accessibilityHint={
                    status === "taken"
                      ? "Ocupado"
                      : status === "too_soon"
                        ? "Falta menos de 30 minutos"
                        : undefined
                  }
                  accessibilityState={{ checked: selected, disabled: status !== "free" }}
                  disabled={status !== "free"}
                  onPress={() => onChange(slot.start)}
                  style={({ pressed }) => [
                    styles.seat,
                    status === "free" && styles.seatFree,
                    status === "taken" && styles.seatTaken,
                    status === "too_soon" && styles.seatSoon,
                    selected && styles.seatSelected,
                    pressed && status === "free" && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[
                      styles.seatText,
                      status === "taken" && styles.seatTextTaken,
                      status === "too_soon" && { color: colors.mutedForeground },
                      selected && { color: colors.primaryForeground },
                    ]}
                  >
                    {time}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {free === 0 ? (
        <Body muted style={{ fontSize: 13 }}>
          Prueba con otro día o con otro profesional.
        </Body>
      ) : null}
    </View>
  );
}

function Legend({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, style]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing(4), rowGap: spacing(2) },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  swatch: { width: 18, height: 14, borderRadius: 4, borderWidth: 1 },
  legendText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },
  count: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.foreground },
  period: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  seat: {
    width: "23%",
    minHeight: 44,
    borderRadius: radius.field / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  seatFree: { backgroundColor: colors.card, borderColor: colors.ring },
  seatSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  seatTaken: { backgroundColor: colors.surfaceStrong, borderColor: colors.surfaceStrong },
  seatSoon: { backgroundColor: colors.muted, borderColor: colors.border, borderStyle: "dashed" },
  seatText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  seatTextTaken: {
    color: "rgba(238, 247, 246, 0.45)",
    textDecorationLine: "line-through",
  },
});
