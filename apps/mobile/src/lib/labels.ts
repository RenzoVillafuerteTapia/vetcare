import type { Schemas } from "@vetcare/shared";

export type Pet = Schemas["PetResponse"];
export type Appointment = Schemas["AppointmentResponse"];
export type AppointmentStatus = Schemas["AppointmentStatus"];
export type ServiceType = Schemas["ServiceTypeResponse"];

export const SPECIES_LABELS: Record<Schemas["Species"], string> = {
  dog: "Perro",
  cat: "Gato",
  rabbit: "Conejo",
  bird: "Ave",
  rodent: "Roedor",
  reptile: "Reptil",
  other: "Otra especie",
};

export const SEX_LABELS: Record<Schemas["Sex"], string> = {
  male: "Macho",
  female: "Hembra",
  unknown: "Sexo sin determinar",
};

export const GUARDIAN_LABELS: Record<Schemas["GuardianKind"], string> = {
  owner: "Dueño",
  authorized: "Responsable autorizado",
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  requested: "Por confirmar",
  confirmed: "Confirmada",
  checked_in: "En atención",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};

/** Citas que siguen en pie (todavía ocupan un horario). */
export const ACTIVE: readonly AppointmentStatus[] = ["requested", "confirmed", "checked_in"];

/** El cliente cambia o cancela una cita confirmada con al menos esta antelación. */
export const CLIENT_CHANGE_NOTICE_MS = 2 * 60 * 60 * 1000;

/** Próximas citas activas, de la más cercana a la más lejana. */
export function upcoming(appointments: Appointment[], now: number = Date.now()): Appointment[] {
  return appointments
    .filter((a) => ACTIVE.includes(a.status) && Date.parse(a.end) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Citas ya pasadas o cerradas, de la más reciente a la más antigua. */
export function past(appointments: Appointment[], now: number = Date.now()): Appointment[] {
  const next = new Set(upcoming(appointments, now).map((a) => a.id));
  return appointments
    .filter((a) => !next.has(a.id))
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
}

/** ¿Puede el cliente reprogramar o cancelar por su cuenta? (La API vuelve a verificarlo.) */
export function clientCanChange(appointment: Appointment, now: number = Date.now()): boolean {
  if (appointment.status === "requested") return Date.parse(appointment.start) > now;
  if (appointment.status !== "confirmed") return false;
  return Date.parse(appointment.start) - now >= CLIENT_CHANGE_NOTICE_MS;
}
