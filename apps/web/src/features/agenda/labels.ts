import type { Schemas } from "@vetcare/shared";

export type Appointment = Schemas["AppointmentResponse"];
export type AppointmentStatus = Schemas["AppointmentStatus"];
export type HistoryAction = Schemas["HistoryAction"];
export type Slot = Schemas["SlotResponse"];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  requested: "Por confirmar",
  confirmed: "Confirmada",
  checked_in: "En atención",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};

/** Clases del evento en el calendario y de la etiqueta de estado. */
export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  requested: "border-amber-500/60 bg-amber-100 text-amber-950",
  confirmed: "border-primary/50 bg-secondary text-secondary-foreground",
  checked_in: "border-success/60 bg-accent text-accent-foreground",
  completed: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-card text-muted-foreground line-through",
  no_show: "border-destructive/40 bg-destructive/5 text-destructive",
};

export const HISTORY_LABELS: Record<HistoryAction, string> = {
  requested: "Solicitada por el cliente",
  booked: "Agendada",
  confirmed: "Confirmada",
  rescheduled: "Reprogramada",
  cancelled: "Cancelada",
  checked_in: "Llegada registrada",
  completed: "Atención completada",
  no_show: "Inasistencia registrada",
};

/** Las que ya no ocupan la agenda: se ocultan salvo que se pida verlas. */
export const CLOSED_STATUSES: readonly AppointmentStatus[] = ["cancelled", "no_show"];
