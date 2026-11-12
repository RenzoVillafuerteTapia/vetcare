import type { Calendar } from "@/features/clinic-setup/labels";

import { endOfRange } from "@/features/clinic-setup/schedule";

export interface CalendarHours {
  /** Primera y última hora que muestra el calendario (`HH:MM:SS`). */
  slotMinTime: string;
  slotMaxTime: string;
  /** Horario de atención para sombrear las horas en que la sede está cerrada. */
  businessHours: { daysOfWeek: number[]; startTime: string; endTime: string }[];
}

const DAY: CalendarHours = { slotMinTime: "00:00:00", slotMaxTime: "24:00:00", businessHours: [] };

const floorHour = (time: string) => `${time.slice(0, 2)}:00:00`;
function ceilHour(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const rounded = minutes > 0 ? hours + 1 : hours;
  return `${String(Math.min(rounded, 24)).padStart(2, "0")}:00:00`;
}

/**
 * Rango de horas del calendario según el horario de atención de la sede (Configuración →
 * Horario y feriados): desde la apertura más temprana hasta el cierre más tardío de la semana.
 * Sin horario configurado se muestra el día completo.
 */
export function calendarHours(calendar: Calendar | undefined): CalendarHours {
  const ranges = calendar?.opening_hours ?? [];
  if (ranges.length === 0) return DAY;
  const starts = ranges.map((r) => r.start.slice(0, 5));
  const ends = ranges.map((r) => endOfRange(r.end.slice(0, 5)));
  return {
    slotMinTime: floorHour(starts.reduce((a, b) => (a < b ? a : b))),
    slotMaxTime: ceilHour(ends.reduce((a, b) => (a > b ? a : b))),
    // La API cuenta los días desde el lunes (0); el calendario, desde el domingo (0).
    businessHours: ranges.map((r) => ({
      daysOfWeek: [(r.weekday + 1) % 7],
      startTime: r.start.slice(0, 5),
      endTime: endOfRange(r.end.slice(0, 5)),
    })),
  };
}
