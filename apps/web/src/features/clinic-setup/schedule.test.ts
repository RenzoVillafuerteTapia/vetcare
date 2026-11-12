import { describe, expect, it } from "vitest";

import { normalizeSchedule, scheduleProblem, scheduleSummary } from "./schedule";

describe("horario semanal", () => {
  it("normaliza las horas de la API y ordena por día y hora", () => {
    expect(
      normalizeSchedule([
        { weekday: 1, start: "14:00:00", end: "19:00:00" },
        { weekday: 0, start: "09:00:00", end: "13:00:00" },
        { weekday: 1, start: "09:00:00", end: "13:00:00" },
      ]),
    ).toEqual([
      { weekday: 0, start: "09:00", end: "13:00" },
      { weekday: 1, start: "09:00", end: "13:00" },
      { weekday: 1, start: "14:00", end: "19:00" },
    ]);
  });

  it("acepta franjas contiguas y un horario vacío", () => {
    expect(scheduleProblem([])).toBeNull();
    expect(
      scheduleProblem([
        { weekday: 0, start: "09:00", end: "13:00" },
        { weekday: 0, start: "13:00", end: "19:00" },
      ]),
    ).toBeNull();
  });

  it("detecta franjas incompletas, invertidas, fuera de la grilla y superpuestas", () => {
    expect(scheduleProblem([{ weekday: 2, start: "09:00", end: "" }])).toBe(
      "Completa las horas del miércoles.",
    );
    expect(scheduleProblem([{ weekday: 0, start: "13:00", end: "09:00" }])).toMatch(
      /posterior a la de inicio/,
    );
    expect(scheduleProblem([{ weekday: 0, start: "09:03", end: "10:00" }])).toMatch(
      /múltiplos de 5/,
    );
    expect(
      scheduleProblem([
        { weekday: 5, start: "09:00", end: "13:00" },
        { weekday: 5, start: "12:00", end: "14:00" },
      ]),
    ).toBe("El sábado tiene franjas superpuestas.");
  });

  it("resume agrupando los días seguidos con las mismas franjas", () => {
    const weekdays = [0, 1, 2, 3, 4] as const;
    expect(
      scheduleSummary([
        ...weekdays.map((weekday) => ({ weekday, start: "09:00:00", end: "13:00:00" })),
        ...weekdays.map((weekday) => ({ weekday, start: "14:00:00", end: "19:00:00" })),
        { weekday: 5, start: "09:00:00", end: "14:00:00" },
      ]),
    ).toEqual(["Lunes a viernes: 09:00–13:00, 14:00–19:00", "Sábado: 09:00–14:00"]);
    expect(
      scheduleSummary([
        { weekday: 0, start: "09:00", end: "13:00" },
        { weekday: 1, start: "09:00", end: "13:00" },
        { weekday: 3, start: "09:00", end: "13:00" },
      ]),
    ).toEqual(["Lunes y martes: 09:00–13:00", "Jueves: 09:00–13:00"]);
    expect(scheduleSummary([])).toEqual([]);
  });
});

describe("franjas hasta la medianoche", () => {
  it("00:00 como fin es la medianoche, no un fin anterior al inicio", () => {
    expect(scheduleProblem([{ weekday: 0, start: "20:00", end: "00:00" }])).toBeNull();
    expect(scheduleProblem([{ weekday: 0, start: "00:00", end: "00:00" }])).toBeNull();
    expect(
      scheduleProblem([
        { weekday: 0, start: "20:00", end: "00:00" },
        { weekday: 0, start: "22:00", end: "23:00" },
      ]),
    ).toMatch(/superpuestas/);
  });

  it("se resumen como 24:00 o como 24 horas", () => {
    expect(
      scheduleSummary([
        { weekday: 0, start: "00:00", end: "00:00" },
        { weekday: 1, start: "00:00", end: "00:00" },
        { weekday: 5, start: "18:00", end: "00:00" },
      ]),
    ).toEqual(["Lunes y martes: 24 horas", "Sábado: 18:00–24:00"]);
  });
});
