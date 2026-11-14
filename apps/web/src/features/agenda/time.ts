/**
 * La agenda se muestra siempre en la hora de la sede (America/Lima, UTC-5 fijo, sin horario de
 * verano), sin importar la zona del navegador.
 *
 * El calendario trabaja en "UTC" con horas de pared de Lima: un instante de la API se convierte
 * en su hora de pared (`2026-11-12T10:30:00`) y, al revés, lo que devuelve el calendario se lee
 * como hora de Lima.
 */
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const LIMA_OFFSET = "-05:00";

/** Instante de la API → hora de pared de Lima, sin zona (`2026-11-12T10:30:00`). */
export const toWall = (iso: string) =>
  new Date(new Date(iso).getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 19);

/** Hora de pared de Lima (con o sin la `Z` que agrega el calendario) → instante con zona. */
export const fromWall = (wall: string) => `${wall.slice(0, 19)}${LIMA_OFFSET}`;

/** "Ahora" como hora de pared de Lima expresada en UTC, que es como la espera el calendario. */
export const wallNow = (now: Date = new Date()) => new Date(now.getTime() - LIMA_OFFSET_MS);

/** Día de hoy en la sede (`2026-11-12`). */
export const limaToday = (now: Date = new Date()) => wallNow(now).toISOString().slice(0, 10);

/** Día (`2026-11-12`) de un instante de la API, en la sede. */
export const limaDay = (iso: string) => toWall(iso).slice(0, 10);

/** Hora (`10:30`) de un instante de la API, en la sede. */
export const limaTime = (iso: string) => toWall(iso).slice(11, 16);

const dayFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** `jueves, 12 de noviembre · 10:30 – 11:00` */
export function formatSlot(start: string, end: string): string {
  return `${dayFormat.format(new Date(start))} · ${limaTime(start)} – ${limaTime(end)}`;
}

const stampFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Momento de una entrada del historial: `12 nov, 09:41`. */
export const formatStamp = (iso: string) => stampFormat.format(new Date(iso));
