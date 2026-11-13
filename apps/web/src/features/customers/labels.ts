import type { Schemas } from "@vetcare/shared";

export type Client = Schemas["ClientResponse"];
export type Pet = Schemas["PetResponse"];
export type Guardian = Schemas["GuardianResponse"];
export type DocumentType = Schemas["DocumentType"];
export type Species = Schemas["Species"];
export type Sex = Schemas["Sex"];
export type PetStatus = Schemas["PetStatus"];
export type GuardianKind = Schemas["GuardianKind"];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  dni: "DNI",
  ce: "Carné de extranjería",
  passport: "Pasaporte",
};

export const SPECIES_LABELS: Record<Species, string> = {
  dog: "Perro",
  cat: "Gato",
  rabbit: "Conejo",
  bird: "Ave",
  rodent: "Roedor",
  reptile: "Reptil",
  other: "Otra",
};

export const SEX_LABELS: Record<Sex, string> = {
  male: "Macho",
  female: "Hembra",
  unknown: "Sin determinar",
};

export const STATUS_LABELS: Record<PetStatus, string> = {
  active: "Activa",
  deceased: "Fallecida",
  transferred: "Transferida",
};

export const GUARDIAN_LABELS: Record<GuardianKind, string> = {
  owner: "Dueño",
  authorized: "Responsable autorizado",
};

export const PERMISSION_LABELS = {
  can_pickup: "Recoger a la mascota",
  can_book: "Reservar citas",
  can_view_clinical: "Ver información clínica",
} as const;

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_LABELS) as DocumentType[];
export const SPECIES = Object.keys(SPECIES_LABELS) as Species[];
export const SEXES = Object.keys(SEX_LABELS) as Sex[];
export const STATUSES = Object.keys(STATUS_LABELS) as PetStatus[];

/** Los campos opcionales vacíos viajan como `null`, no como texto vacío. */
export const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());

const dayFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Una fecha sin hora (`2021-03-15`), sin que la zona del navegador la corra un día. */
export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));

const dateTimeFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Un instante de la API como fecha en la zona de la sede. */
export const formatInstantDay = (iso: string) => dateTimeFormat.format(new Date(iso));

/** Edad a partir de la fecha de nacimiento: "3 años", "1 año y 2 meses", "5 meses". */
export function formatAge(birthDate: string, today: Date = new Date()): string {
  const [year = 0, month = 1, day = 1] = birthDate.split("-").map(Number);
  let months = (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
  if (today.getDate() < day) months -= 1;
  if (months < 1) return "menos de 1 mes";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsText = `${years} ${years === 1 ? "año" : "años"}`;
  const monthsText = `${rest} ${rest === 1 ? "mes" : "meses"}`;
  if (years === 0) return monthsText;
  return rest === 0 || years >= 2 ? yearsText : `${yearsText} y ${monthsText}`;
}

/** La API devuelve los kilos como texto decimal (`"12.50"`). */
export const formatKilograms = (kilograms: string | number) =>
  `${Number(kilograms).toLocaleString("es-PE", { maximumFractionDigits: 2 })} kg`;
