/** Claves de TanStack Query de la agenda. Invalidar `APPOINTMENTS` refresca citas y horarios. */
export const APPOINTMENTS = ["appointments"] as const;

export const agendaKey = (from: string, to: string, resourceId: string | null) =>
  [...APPOINTMENTS, "agenda", from, to, resourceId] as const;

export const availabilityKey = (serviceTypeId: string, day: string) =>
  [...APPOINTMENTS, "availability", serviceTypeId, day] as const;

/** Catálogo de la sede, compartido con la sección Configuración. */
export const SERVICE_TYPES = ["clinic", "service-types"] as const;
export const RESOURCES = ["clinic", "resources"] as const;
export const CALENDAR = ["clinic", "calendar"] as const;
