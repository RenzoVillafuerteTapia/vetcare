import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CalendarPlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Loading } from "@/components/appointments";
import { Badge, Body, Button, Card, Notice, PageHeader, Screen, Segmented } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { CATEGORY_LABELS, formatDuration, type Calendar, type ServiceType } from "@/lib/labels";
import { CALENDAR, SERVICE_TYPES } from "@/lib/queries";
import { formatCalendarDay, limaDay, limaTime } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

type Section = "horario" | "servicios";

// El contrato numera los días desde el lunes (0) hasta el domingo (6).
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function ClinicScreen() {
  const [section, setSection] = useState<Section>("horario");
  return (
    <Screen tabs>
      <PageHeader title="Clínica" subtitle="Horario de atención y servicios que puedes pedir." />
      <Segmented
        segments={[
          { value: "horario", label: "Horario" },
          { value: "servicios", label: "Servicios" },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === "horario" ? <Hours /> : <Services />}
    </Screen>
  );
}

// --- Horario -------------------------------------------------------------------------------

/** `24:00` cuando la franja llega a la medianoche (la API la envía como `00:00`). */
const endLabel = (end: string) => (end.startsWith("00:00") ? "24:00" : end.slice(0, 5));

function todayIndex(now: number): number {
  // Día de la semana en la sede, contado desde el lunes.
  const sunday0 = new Date(`${limaDay(now)}T00:00:00Z`).getUTCDay();
  return (sunday0 + 6) % 7;
}

function openNow(calendar: Calendar, now: number): boolean {
  const today = limaDay(now);
  if (calendar.holidays.some((h) => h.day === today)) return false;
  const time = limaTime(now);
  return calendar.opening_hours.some(
    (r) => r.weekday === todayIndex(now) && r.start.slice(0, 5) <= time && time < endLabel(r.end),
  );
}

function Hours() {
  const { api } = useSessionManager();
  const calendar = useQuery({
    queryKey: CALENDAR,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/calendar")),
  });
  const [now] = useState(() => Date.now());

  if (calendar.isPending) return <Loading label="Cargando el horario…" />;
  if (calendar.isError) return <Notice tone="error">{errorMessage(calendar.error)}</Notice>;

  const data = calendar.data;
  const today = todayIndex(now);
  const todayDay = limaDay(now);
  const holidays = data.holidays.filter((h) => h.day >= todayDay).slice(0, 3);

  return (
    <View style={{ gap: spacing(4) }}>
      <View style={styles.status}>
        <View
          style={[
            styles.dot,
            { backgroundColor: openNow(data, now) ? colors.success : colors.destructive },
          ]}
        />
        <Text style={styles.statusText}>
          {openNow(data, now) ? "Abierto ahora" : "Cerrado ahora"}
        </Text>
      </View>
      <Card style={{ gap: spacing(2.5) }}>
        {WEEKDAYS.map((name, weekday) => {
          const ranges = data.opening_hours.filter((r) => r.weekday === weekday);
          const allDay =
            ranges.length === 1 &&
            ranges[0]?.start.startsWith("00:00") &&
            ranges[0]?.end.startsWith("00:00");
          return (
            <View
              key={name}
              style={styles.day}
              accessibilityLabel={`${name}: ${
                ranges.length === 0
                  ? "cerrado"
                  : allDay
                    ? "24 horas"
                    : ranges.map((r) => `${r.start.slice(0, 5)} a ${endLabel(r.end)}`).join(", ")
              }`}
            >
              <Text style={[styles.dayName, weekday === today && styles.today]}>{name}</Text>
              <Text style={[styles.dayHours, weekday === today && styles.today]}>
                {ranges.length === 0
                  ? "Cerrado"
                  : allDay
                    ? "24 horas"
                    : ranges.map((r) => `${r.start.slice(0, 5)}–${endLabel(r.end)}`).join("  ")}
              </Text>
            </View>
          );
        })}
      </Card>
      {holidays.length > 0 ? (
        <View style={{ gap: spacing(2) }}>
          <Text style={styles.subtitle}>Feriados (sin atención)</Text>
          {holidays.map((h) => (
            <Body key={h.day} muted style={{ fontSize: 14 }}>
              {formatCalendarDay(h.day)} · {h.name}
            </Body>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// --- Servicios -----------------------------------------------------------------------------

function Services() {
  const { api } = useSessionManager();
  const router = useRouter();
  const services = useQuery({
    queryKey: SERVICE_TYPES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/service-types")),
  });
  const [open, setOpen] = useState<string | null>(null);

  if (services.isPending) return <Loading label="Cargando los servicios…" />;
  if (services.isError) return <Notice tone="error">{errorMessage(services.error)}</Notice>;

  const active = services.data.filter((s) => s.active);
  if (active.length === 0) {
    return (
      <Card>
        <Body muted>La veterinaria todavía no publicó sus servicios.</Body>
      </Card>
    );
  }
  const groups = new Map<ServiceType["category"], ServiceType[]>();
  for (const s of active) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  return (
    <View style={{ gap: spacing(4) }}>
      {[...groups].map(([category, items]) => (
        <View key={category} style={{ gap: spacing(2) }}>
          <Text style={styles.subtitle}>{CATEGORY_LABELS[category]}</Text>
          <Card style={{ gap: 0, paddingVertical: spacing(2) }}>
            {items.map((s, i) => (
              <View key={s.id} style={[styles.service, i > 0 && styles.serviceDivider]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={s.name}
                  accessibilityState={{ expanded: open === s.id }}
                  onPress={() => setOpen(open === s.id ? null : s.id)}
                  style={styles.serviceHead}
                >
                  <Text style={styles.serviceName}>{s.name}</Text>
                  <Badge>{formatDuration(s.duration_minutes)}</Badge>
                </Pressable>
                {open === s.id ? (
                  <View style={{ gap: spacing(3) }}>
                    {s.description ? <Body muted>{s.description}</Body> : null}
                    {s.bookable_by_client ? (
                      <Button
                        label="Solicitar este servicio"
                        icon={CalendarPlus}
                        variant="outline"
                        onPress={() => router.navigate(`/citas/nueva?serviceId=${s.id}`)}
                      />
                    ) : (
                      <Body muted style={{ fontSize: 13 }}>
                        Se agenda en la veterinaria, por teléfono o en recepción.
                      </Body>
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  day: { flexDirection: "row", justifyContent: "space-between", gap: spacing(3) },
  dayName: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.foreground },
  dayHours: { fontFamily: fonts.body, fontSize: 15, color: colors.mutedForeground },
  today: { fontFamily: fonts.bodyBold, color: colors.primary },
  subtitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.mutedForeground },
  service: { paddingVertical: spacing(3), gap: spacing(2) },
  serviceDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  serviceHead: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  serviceName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
});
