/**
 * Fechas y horas en la hora de la sede (America/Lima, UTC-5 fijo, sin horario de verano), sin
 * depender de la zona del teléfono ni de que el motor de JavaScript traiga datos de Intl.
 */
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Instante → fecha cuyos campos UTC son la hora de pared de Lima. */
const wall = (instant: string | number | Date) =>
  new Date(new Date(instant).getTime() - LIMA_OFFSET_MS);

const pad = (n: number) => String(n).padStart(2, "0");

/** Día (`2026-11-12`) de un instante, en la sede. */
export const limaDay = (instant: string | number | Date) =>
  wall(instant).toISOString().slice(0, 10);

/** Hora (`10:30`) de un instante, en la sede. */
export function limaTime(instant: string | number | Date): string {
  const w = wall(instant);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** `jueves 12 de noviembre` */
export function formatDate(instant: string | number | Date): string {
  const w = wall(instant);
  return `${WEEKDAYS[w.getUTCDay()]} ${w.getUTCDate()} de ${MONTHS[w.getUTCMonth()]}`;
}

/** `jueves 12 de noviembre · 10:30 – 11:00` */
export const formatSlot = (start: string, end: string) =>
  `${formatDate(start)} · ${limaTime(start)} – ${limaTime(end)}`;

/** Fecha sin hora (`2021-03-15`) en texto: `15 de marzo de 2021`. */
export function formatCalendarDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} de ${MONTHS[(month ?? 1) - 1]} de ${year}`;
}

export interface DayOption {
  day: string;
  label: string;
}

/** Los próximos días de la sede, desde hoy, con una etiqueta corta para elegirlos. */
export function upcomingDays(count: number, now: number = Date.now()): DayOption[] {
  return Array.from({ length: count }, (_, index) => {
    const w = wall(now + index * DAY_MS);
    const day = w.toISOString().slice(0, 10);
    const label =
      index === 0
        ? "Hoy"
        : index === 1
          ? "Mañana"
          : `${WEEKDAYS_SHORT[w.getUTCDay()]} ${w.getUTCDate()}`;
    return { day, label };
  });
}
