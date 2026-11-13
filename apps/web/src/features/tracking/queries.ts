/** Claves de TanStack Query del seguimiento. Invalidar `TRACKING` refresca tablero y citas. */
export const TRACKING = ["tracking"] as const;

export const trackingBoardKey = [...TRACKING, "board"] as const;

export const appointmentTrackingKey = (appointmentId: string) =>
  [...TRACKING, "appointment", appointmentId] as const;
