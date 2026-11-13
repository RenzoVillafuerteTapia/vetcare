import type { Appointment, Calendar, Pet, Profile, ServiceType } from "@/lib/labels";

import { json, tokens, user } from "./fake-api";
import { REFRESH_KEY } from "./render-app";

/** Jueves 12 de noviembre de 2026, 09:00 en Lima. */
export const NOW = new Date("2026-11-12T14:00:00Z");

/** Sesión de un cliente ya guardada en SecureStore, como al reabrir la app. */
export const signedIn = {
  "POST /api/v1/auth/refresh": () => tokens("access-2", "refresh-2"),
  "GET /api/v1/auth/me": () => json(user()),
};
export { REFRESH_KEY };

export const luna: Pet = {
  id: "0192f0a4-0000-7000-8000-00000000e001",
  name: "Luna",
  species: "dog",
  sex: "female",
  breed: "Schnauzer",
  birth_date: "2021-03-15",
  birth_date_approximate: true,
  color: "Sal y pimienta",
  status: "active",
  allergies: "Pollo",
  notes: null,
  photo_url: null,
  can_change_photo: true,
  weights: [{ kilograms: "7.85", measured_at: "2026-10-20T16:00:00Z" }],
  guardians: [
    {
      client_id: "0192f0a4-0000-7000-8000-00000000c001",
      full_name: "Ana Pérez",
      kind: "owner",
      permissions: { can_pickup: true, can_book: true, can_view_clinical: true },
    },
    {
      client_id: "0192f0a4-0000-7000-8000-00000000c002",
      full_name: "Luis Torres",
      kind: "authorized",
      permissions: { can_pickup: true, can_book: false, can_view_clinical: false },
    },
  ],
};

export const toby: Pet = {
  ...luna,
  id: "0192f0a4-0000-7000-8000-00000000e002",
  name: "Toby",
  species: "cat",
  breed: null,
  allergies: null,
};

export const consulta: ServiceType = {
  id: "0192f0a4-0000-7000-8000-0000000000b1",
  code: "consulta",
  name: "Consulta general",
  category: "consultation",
  duration_minutes: 30,
  required_resources: ["veterinarian"],
  bookable_by_client: true,
  description: "",
  active: true,
};

/** Confirmada: viernes 13 de noviembre, 10:30 a 11:00 en Lima. */
export const cita: Appointment = {
  id: "0192f0a4-0000-7000-8000-0000000000d1",
  pet_id: luna.id,
  pet_name: "Luna",
  client_id: "0192f0a4-0000-7000-8000-00000000c001",
  service_type_id: consulta.id,
  service_name: "Consulta general",
  start: "2026-11-13T15:30:00Z",
  end: "2026-11-13T16:00:00Z",
  status: "confirmed",
  channel: "staff",
  resource_ids: [],
  reason: "Control anual",
  cancellation_reason: null,
  created_at: "2026-11-10T15:00:00Z",
  notes: null,
  history: null,
};

/** Completada hace un mes. */
export const anterior: Appointment = {
  ...cita,
  id: "0192f0a4-0000-7000-8000-0000000000d0",
  service_name: "Vacunación",
  start: "2026-10-12T15:00:00Z",
  end: "2026-10-12T15:15:00Z",
  status: "completed",
};

/** Lunes a viernes de 09:00 a 18:00 y sábado de 09:00 a 13:00 (la API cuenta desde el lunes). */
export const calendario: Calendar = {
  timezone: "America/Lima",
  opening_hours: [
    ...([0, 1, 2, 3, 4] as const).map((weekday) => ({ weekday, start: "09:00", end: "18:00" })),
    { weekday: 5, start: "09:00", end: "13:00" },
  ],
  holidays: [
    { day: "2026-01-01", name: "Año Nuevo" },
    { day: "2026-12-08", name: "Inmaculada Concepción" },
  ],
};

export const perfil: Profile = {
  full_name: "Ana Pérez",
  document_type: "dni",
  document_number: "12345678",
  phone: "+51987654321",
  email: "ana@example.test",
  address: null,
};
