import { describe, expect, it } from "vitest";

import type { Calendar } from "@/features/clinic-setup/labels";

import { calendarHours } from "./opening-hours";

const calendar = (
  opening_hours: { weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; start: string; end: string }[],
) =>
  ({
    timezone: "America/Lima" as const,
    opening_hours,
    holidays: [],
  }) satisfies Calendar;

describe("horas que muestra la agenda", () => {
  it("van de la apertura más temprana al cierre más tardío de la semana", () => {
    const hours = calendarHours(
      calendar([
        { weekday: 0, start: "09:00:00", end: "13:00:00" },
        { weekday: 0, start: "14:00:00", end: "19:30:00" },
        { weekday: 5, start: "08:30:00", end: "14:00:00" },
      ]),
    );

    expect(hours.slotMinTime).toBe("08:00:00");
    expect(hours.slotMaxTime).toBe("20:00:00");
    // El calendario cuenta desde el domingo: lunes = 1, sábado = 6.
    expect(hours.businessHours).toEqual([
      { daysOfWeek: [1], startTime: "09:00", endTime: "13:00" },
      { daysOfWeek: [1], startTime: "14:00", endTime: "19:30" },
      { daysOfWeek: [6], startTime: "08:30", endTime: "14:00" },
    ]);
  });

  it("una sede abierta las 24 horas muestra el día completo", () => {
    const hours = calendarHours(
      calendar([
        { weekday: 6, start: "00:00:00", end: "00:00:00" },
        { weekday: 0, start: "20:00:00", end: "00:00:00" },
      ]),
    );

    expect([hours.slotMinTime, hours.slotMaxTime]).toEqual(["00:00:00", "24:00:00"]);
    expect(hours.businessHours[0]).toEqual({
      daysOfWeek: [0],
      startTime: "00:00",
      endTime: "24:00",
    });
  });

  it("sin horario configurado también muestra el día completo", () => {
    expect(calendarHours(undefined)).toMatchObject({
      slotMinTime: "00:00:00",
      slotMaxTime: "24:00:00",
    });
    expect(calendarHours(calendar([])).businessHours).toEqual([]);
  });
});
