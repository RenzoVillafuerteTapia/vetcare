import { shortTime, WEEKDAYS, type ScheduleEntry } from "./labels";

/** Horario tal como llega de la API, con horas `HH:MM` y ordenado por día y hora. */
export function normalizeSchedule(entries: readonly ScheduleEntry[]): ScheduleEntry[] {
  return entries
    .map((entry) => ({ ...entry, start: shortTime(entry.start), end: shortTime(entry.end) }))
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

const onGrid = (time: string) => Number(time.slice(3, 5)) % 5 === 0;

/**
 * Primer problema de un horario semanal, o `null` si es válido. Son las mismas reglas que
 * aplica la API (franjas completas, en múltiplos de 5 minutos y sin superponerse); validarlas
 * aquí evita un viaje al servidor para errores evidentes.
 */
export function scheduleProblem(entries: readonly ScheduleEntry[]): string | null {
  for (const { weekday, start, end } of entries) {
    const day = WEEKDAYS[weekday].toLowerCase();
    if (!start || !end) {
      return `Completa las horas del ${day}.`;
    }
    if (start >= end) {
      return `El ${day}, la hora de fin debe ser posterior a la de inicio.`;
    }
    if (!onGrid(start) || !onGrid(end)) {
      return `El ${day}, usa horas en múltiplos de 5 minutos.`;
    }
  }
  const sorted = normalizeSchedule(entries);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    if (previous.weekday === current.weekday && current.start < previous.end) {
      return `El ${WEEKDAYS[current.weekday].toLowerCase()} tiene franjas superpuestas.`;
    }
  }
  return null;
}

/**
 * Resumen legible: un renglón por grupo de días seguidos con las mismas franjas, p. ej.
 * "Lunes a viernes: 09:00–13:00, 14:00–19:00".
 */
export function scheduleSummary(entries: readonly ScheduleEntry[]): string[] {
  const byDay = new Map<number, string[]>();
  for (const entry of normalizeSchedule(entries)) {
    byDay.set(entry.weekday, [...(byDay.get(entry.weekday) ?? []), `${entry.start}–${entry.end}`]);
  }
  const groups: { first: number; last: number; ranges: string }[] = [];
  for (const [weekday, ranges] of byDay) {
    const joined = ranges.join(", ");
    const previous = groups.at(-1);
    if (previous && previous.last === weekday - 1 && previous.ranges === joined) {
      previous.last = weekday;
    } else {
      groups.push({ first: weekday, last: weekday, ranges: joined });
    }
  }
  return groups.map(({ first, last, ranges }) => {
    const days =
      first === last
        ? WEEKDAYS[first]
        : `${WEEKDAYS[first]} ${last === first + 1 ? "y" : "a"} ${WEEKDAYS[last]?.toLowerCase()}`;
    return `${days}: ${ranges}`;
  });
}
