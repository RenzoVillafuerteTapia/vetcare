import { clientCanChange, past, upcoming, type Appointment } from "./labels";
import { formatCalendarDay, formatSlot, limaDay, limaTime, upcomingDays } from "./time";

const NOW = Date.parse("2026-11-12T14:00:00Z"); // jueves 12, 09:00 en Lima

describe("horas de la sede", () => {
  it("muestra la hora de Lima sin importar la zona del teléfono", () => {
    expect(limaTime("2026-11-12T15:30:00Z")).toBe("10:30");
    // A las 02:15 UTC del 13, en Lima todavía es 12.
    expect(limaDay("2026-11-13T02:15:00Z")).toBe("2026-11-12");
    expect(formatSlot("2026-11-12T15:30:00Z", "2026-11-12T16:00:00Z")).toBe(
      "jueves 12 de noviembre · 10:30 – 11:00",
    );
    expect(formatCalendarDay("2021-03-05")).toBe("5 de marzo de 2021");
  });

  it("ofrece los próximos días desde hoy", () => {
    expect(upcomingDays(4, NOW)).toEqual([
      { day: "2026-11-12", label: "Hoy" },
      { day: "2026-11-13", label: "Mañana" },
      { day: "2026-11-14", label: "sáb 14" },
      { day: "2026-11-15", label: "dom 15" },
    ]);
  });
});

describe("reglas de las citas del cliente", () => {
  const base = {
    status: "confirmed",
    start: "2026-11-12T19:00:00Z",
    end: "2026-11-12T19:30:00Z",
  } as Appointment;

  it("separa las próximas de las anteriores", () => {
    const hoy = { ...base, id: "hoy" };
    const cancelada = { ...base, id: "cancelada", status: "cancelled" } as Appointment;
    const ayer = {
      ...base,
      id: "ayer",
      start: "2026-11-11T19:00:00Z",
      end: "2026-11-11T19:30:00Z",
    };
    const lejos = {
      ...base,
      id: "lejos",
      start: "2026-11-20T19:00:00Z",
      end: "2026-11-20T19:30:00Z",
    };

    expect(upcoming([lejos, cancelada, hoy, ayer], NOW).map((a) => a.id)).toEqual(["hoy", "lejos"]);
    expect(past([lejos, cancelada, hoy, ayer], NOW).map((a) => a.id)).toEqual([
      "cancelada",
      "ayer",
    ]);
  });

  it("una confirmada se cambia con 2 horas de antelación; una solicitud, mientras no empiece", () => {
    expect(clientCanChange(base, NOW)).toBe(true); // 5 h antes
    expect(clientCanChange({ ...base, start: "2026-11-12T15:59:00Z" }, NOW)).toBe(false);
    expect(clientCanChange({ ...base, start: "2026-11-12T16:00:00Z" }, NOW)).toBe(true);
    expect(
      clientCanChange({ ...base, status: "requested", start: "2026-11-12T14:30:00Z" }, NOW),
    ).toBe(true);
    expect(clientCanChange({ ...base, status: "checked_in" }, NOW)).toBe(false);
  });
});
