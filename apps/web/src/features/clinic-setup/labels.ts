import type { Schemas } from "@vetcare/shared";

export type ServiceType = Schemas["ServiceTypeResponse"];
export type ServiceCategory = Schemas["ServiceCategory"];
export type Resource = Schemas["ResourceResponse"];
export type ResourceKind = Schemas["ResourceKind"];
export type ScheduleEntry = Schemas["ScheduleEntry"];
export type Calendar = Schemas["CalendarResponse"];

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  consultation: "Consulta",
  vaccination: "Vacunación",
  grooming: "Baño y peluquería",
  surgery: "Cirugía",
  hospitalization: "Hospitalización",
  other: "Otro",
};

export const KIND_LABELS: Record<ResourceKind, string> = {
  veterinarian: "Veterinario",
  groomer: "Groomer",
  consultation_room: "Consultorio",
  grooming_station: "Estación de baño",
  operating_room: "Quirófano",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as ServiceCategory[];
export const KINDS = Object.keys(KIND_LABELS) as ResourceKind[];

/** 0 = lunes … 6 = domingo, como en la API. */
export const WEEKDAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

/** La API devuelve `09:00:00`; los campos de hora usan `09:00`. */
export const shortTime = (value: string) => value.slice(0, 5);

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// La sede trabaja en America/Lima, que no tiene horario de verano: siempre UTC-5.
const LIMA_OFFSET = "-05:00";

/** Convierte el valor de un campo `datetime-local` (hora de la sede) en un instante con zona. */
export const limaLocalToIso = (local: string) => `${local}:00${LIMA_OFFSET}`;

const dateTimeFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Un instante de la API mostrado en la hora de la sede. */
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

const dayFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Una fecha sin hora (`2026-12-25`) en texto, sin que la zona del navegador la corra un día. */
export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
