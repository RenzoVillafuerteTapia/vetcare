import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";

import { Body, Card, Notice } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { STATUS_LABELS, type Appointment, type AppointmentStatus } from "@/lib/labels";
import { availabilityKey } from "@/lib/queries";
import { formatSlot, limaTime, upcomingDays } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

// --- Navegación --------------------------------------------------------------------------

export function BackLink({ label = "Volver" }: { label?: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={12}
      style={styles.back}
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <ChevronLeft size={18} color={colors.mutedForeground} />
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} />
      <Body muted>{label}</Body>
    </View>
  );
}

// --- Estado ------------------------------------------------------------------------------

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; fg: string }> = {
  requested: { bg: "#fdf3dc", fg: "#6b4a00" },
  confirmed: { bg: colors.secondary, fg: colors.secondaryForeground },
  checked_in: { bg: "#e3f4ea", fg: colors.success },
  completed: { bg: colors.muted, fg: colors.mutedForeground },
  cancelled: { bg: colors.muted, fg: colors.mutedForeground },
  no_show: { bg: "#fdf1f1", fg: colors.destructive },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { bg, fg } = STATUS_COLORS[status];
  return (
    <View style={[styles.status, { backgroundColor: bg }]}>
      <Text style={[styles.statusText, { color: fg }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

/** Tarjeta de una cita que abre su detalle. */
export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cita de ${appointment.pet_name}: ${appointment.service_name}, ${formatSlot(
        appointment.start,
        appointment.end,
      )}`}
      onPress={() => router.push(`/citas/${appointment.id}`)}
      style={({ pressed }) => [styles.appointment, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, gap: spacing(1.5) }}>
        <StatusBadge status={appointment.status} />
        <Text style={styles.appointmentTitle}>
          {appointment.pet_name} · {appointment.service_name}
        </Text>
        <Body muted style={{ fontSize: 14 }}>
          {formatSlot(appointment.start, appointment.end)}
        </Body>
      </View>
      <ChevronRight size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

// --- Elegir entre opciones ---------------------------------------------------------------

/**
 * Los próximos 14 días en una franja horizontal: ocupa una sola fila. El día elegido se
 * desplaza a la vista para que no quede cortado en el borde.
 */
export function DayStrip({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const scroller = useRef<ScrollViewInstance>(null);
  const offsets = useRef(new Map<string, number>());
  const reveal = (day: string) => {
    const x = offsets.current.get(day);
    if (x !== undefined) scroller.current?.scrollTo({ x: Math.max(x - spacing(12), 0) });
  };

  return (
    <View style={{ gap: spacing(2) }} accessibilityRole="radiogroup" accessibilityLabel="Día">
      <Text style={styles.label}>Día</Text>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(2), paddingRight: spacing(2) }}
      >
        {upcomingDays(14).map(({ day, label }) => {
          const selected = day === value;
          return (
            <Pressable
              key={day}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected }}
              onLayout={(event) => {
                offsets.current.set(day, event.nativeEvent.layout.x);
                // Al volver a este paso, el día ya elegido aparece a la vista.
                if (selected) reveal(day);
              }}
              onPress={() => {
                onChange(day);
                reveal(day);
              }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export interface Choice {
  value: string;
  label: string;
}

/** Opciones en píldoras; la elegida queda marcada. */
export function ChoiceChips({
  label,
  options,
  value,
  onChange,
  error,
  compact = false,
}: {
  label: string;
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** Píldoras más bajas y en columnas parejas, para listas largas como las horas. */
  compact?: boolean;
}) {
  return (
    <View style={{ gap: spacing(2) }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={[styles.chip, compact && styles.chipCompact, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Día y hora de una cita, entre los horarios libres que informa la API para el servicio. */
export function SlotPicker({
  serviceTypeId,
  day,
  start,
  onDayChange,
  onStartChange,
  error,
}: {
  serviceTypeId: string | null;
  day: string;
  start: string;
  onDayChange: (day: string) => void;
  onStartChange: (start: string) => void;
  error?: string | undefined;
}) {
  const { api } = useSessionManager();
  const slots = useQuery({
    queryKey: availabilityKey(serviceTypeId ?? "", day),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/scheduling/availability", {
          params: { query: { service_type_id: serviceTypeId ?? "", date: day } },
        }),
      ),
    enabled: serviceTypeId !== null,
    staleTime: 0,
  });

  return (
    <Card style={{ gap: spacing(4) }}>
      <DayStrip
        value={day}
        onChange={(value) => {
          onDayChange(value);
          onStartChange("");
        }}
      />
      {serviceTypeId === null ? (
        <Body muted>Elige primero el servicio para ver los horarios.</Body>
      ) : slots.isPending ? (
        <Loading label="Buscando horarios libres…" />
      ) : slots.isError ? (
        <Notice tone="error">{errorMessage(slots.error)}</Notice>
      ) : slots.data.length === 0 ? (
        <Body muted>No hay horarios libres ese día. Prueba con otro.</Body>
      ) : (
        <ChoiceChips
          label="Hora"
          options={slots.data.map((slot) => ({ value: slot.start, label: limaTime(slot.start) }))}
          compact
          value={start}
          onChange={onStartChange}
          error={error}
        />
      )}
      {error && (serviceTypeId === null || !slots.data?.length) ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", gap: spacing(1), alignSelf: "flex-start" },
  backText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.mutedForeground },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
  loading: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  status: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
  },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  appointment: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing(5),
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  appointmentTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.foreground },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.foreground },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing(4),
  },
  chipCompact: {
    minHeight: 36,
    minWidth: "22%",
    alignItems: "center",
    paddingHorizontal: spacing(3),
  },
  chipSelected: { backgroundColor: colors.surfaceStrong, borderColor: colors.surfaceStrong },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.foreground },
  chipTextSelected: { color: colors.surfaceStrongForeground },
  error: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.destructive },
});
