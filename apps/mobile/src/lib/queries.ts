/** Claves de TanStack Query. Invalidar `ME` refresca las mascotas y citas del cliente. */
export const ME = ["me"] as const;
export const MY_PETS = [...ME, "pets"] as const;
export const MY_APPOINTMENTS = [...ME, "appointments"] as const;
export const MY_PROFILE = [...ME, "profile"] as const;
/** Seguimiento en vivo: la lista, el detalle y el de una cita se refrescan cada pocos segundos. */
export const MY_TRACKING = [...ME, "tracking"] as const;
export const trackingKey = (id: string) => [...ME, "tracked", id] as const;
export const appointmentTrackingKey = (appointmentId: string) =>
  [...ME, "appointment-tracking", appointmentId] as const;

export const petKey = (id: string) => [...ME, "pet", id] as const;
export const appointmentKey = (id: string) => [...ME, "appointment", id] as const;

export const SERVICE_TYPES = ["service-types"] as const;
export const CALENDAR = ["clinic-calendar"] as const;
export const availabilityKey = (serviceTypeId: string, day: string, professionalId = "") =>
  ["availability", serviceTypeId, day, professionalId] as const;
/** Veterinarios y groomers: de un servicio, o todos (`""`) para mostrar quién atiende. */
export const professionalsKey = (serviceTypeId = "") => ["professionals", serviceTypeId] as const;

/**
 * Clave de idempotencia para una solicitud de cita: la misma en cada reintento del mismo
 * formulario. No es un secreto; solo debe ser única.
 */
export const newIdempotencyKey = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
