/** Claves de TanStack Query. Invalidar `ME` refresca las mascotas y citas del cliente. */
export const ME = ["me"] as const;
export const MY_PETS = [...ME, "pets"] as const;
export const MY_APPOINTMENTS = [...ME, "appointments"] as const;

export const petKey = (id: string) => [...ME, "pet", id] as const;
export const appointmentKey = (id: string) => [...ME, "appointment", id] as const;

export const SERVICE_TYPES = ["service-types"] as const;
export const availabilityKey = (serviceTypeId: string, day: string) =>
  ["availability", serviceTypeId, day] as const;

/**
 * Clave de idempotencia para una solicitud de cita: la misma en cada reintento del mismo
 * formulario. No es un secreto; solo debe ser única.
 */
export const newIdempotencyKey = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
