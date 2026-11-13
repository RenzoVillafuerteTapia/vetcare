import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Resource, ServiceType } from "@/features/clinic-setup/labels";
import type { Client, Pet } from "@/features/customers/labels";
import { admin, createFakeApi, json, problem, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

import type { Appointment, Slot } from "./labels";
import { formatSlot, fromWall, limaDay, limaTime, limaToday, toWall, wallNow } from "./time";

// Jueves 12 de noviembre de 2026, 09:00 en Lima.
const NOW = new Date("2026-11-12T14:00:00Z");

function signedIn(currentUser = admin()) {
  return {
    "POST /api/v1/auth/refresh": () => tokens(),
    "GET /api/v1/auth/me": () => json(currentUser),
  };
}

const vet: Resource = {
  id: "0192f0a4-0000-7000-8000-0000000000a1",
  kind: "veterinarian",
  name: "Dra. Carla Rojas",
  user_id: null,
  active: true,
  schedule: [],
  time_off: [],
};
const room: Resource = {
  ...vet,
  id: "0192f0a4-0000-7000-8000-0000000000a2",
  kind: "consultation_room",
  name: "Consultorio 1",
};

const consulta: ServiceType = {
  id: "0192f0a4-0000-7000-8000-0000000000b1",
  code: "consulta",
  name: "Consulta general",
  category: "consultation",
  duration_minutes: 30,
  required_resources: ["veterinarian", "consultation_room"],
  bookable_by_client: true,
  description: "",
  active: true,
};

const rosa: Client = {
  id: "0192f0a4-0000-7000-8000-00000000c001",
  full_name: "Rosa Quispe Mamani",
  document_type: "dni",
  document_number: "45678912",
  phone: "987654321",
  email: "rosa@example.test",
  address: null,
  notes: null,
  has_account: false,
  created_at: "2026-11-01T15:00:00Z",
};

const luna: Pet = {
  id: "0192f0a4-0000-7000-8000-00000000e001",
  name: "Luna",
  species: "dog",
  sex: "female",
  breed: null,
  birth_date: null,
  birth_date_approximate: false,
  color: null,
  status: "active",
  allergies: null,
  notes: null,
  photo_url: null,
  // El personal no la cambia desde aquí: es la vista del dueño en la app.
  can_change_photo: false,
  weights: [],
  guardians: [],
};

const cita: Appointment = {
  id: "0192f0a4-0000-7000-8000-0000000000d1",
  pet_id: luna.id,
  pet_name: "Luna",
  client_id: rosa.id,
  service_type_id: consulta.id,
  service_name: "Consulta general",
  // 10:30 a 11:00 en Lima.
  start: "2026-11-12T15:30:00Z",
  end: "2026-11-12T16:00:00Z",
  status: "confirmed",
  channel: "staff",
  resource_ids: [vet.id, room.id],
  reason: "Control anual",
  cancellation_reason: null,
  created_at: "2026-11-10T15:00:00Z",
  notes: "Trae su cartilla.",
  history: [
    {
      at: "2026-11-10T15:00:00Z",
      action: "booked",
      start: "2026-11-12T15:30:00Z",
      end: "2026-11-12T16:00:00Z",
      note: null,
    },
  ],
};

const slot = (start: string, end: string): Slot => ({ start, end, status: "free" });

function agendaRoutes(
  appointments: () => Appointment[],
  overrides: Record<string, (request: Request) => Response | Promise<Response>> = {},
  currentUser = admin(),
) {
  return {
    ...signedIn(currentUser),
    "GET /api/v1/appointments": () => json(appointments()),
    "GET /api/v1/clinic/resources": () => json([vet, room]),
    "GET /api/v1/clinic/service-types": () => json([consulta]),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("horas de la sede", () => {
  it("convierte entre instantes de la API y hora de Lima", () => {
    expect(toWall("2026-11-12T15:30:00Z")).toBe("2026-11-12T10:30:00");
    expect(fromWall("2026-11-12T10:30:00Z")).toBe("2026-11-12T10:30:00-05:00");
    expect(new Date(fromWall(toWall(cita.start))).toISOString()).toBe("2026-11-12T15:30:00.000Z");
    expect(limaTime("2026-11-13T02:15:00Z")).toBe("21:15");
    // A las 02:15 UTC del 13 en Lima todavía es 12.
    expect(limaDay("2026-11-13T02:15:00Z")).toBe("2026-11-12");
    expect(limaToday(new Date("2026-11-13T04:59:00Z"))).toBe("2026-11-12");
    expect(wallNow(NOW).toISOString()).toBe("2026-11-12T09:00:00.000Z");
    expect(formatSlot(cita.start, cita.end)).toBe("jueves, 12 de noviembre · 10:30 – 11:00");
  });
});

describe("acceso a la agenda", () => {
  it("sin appointments:read no se ve ni se abre", async () => {
    renderApp("/agenda", createFakeApi(signedIn(user({ permissions: [] }))).fetch);

    expect(
      await screen.findByRole("heading", { name: "No tienes acceso a esta sección" }),
    ).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation", { name: "Principal" })[0]!;
    expect(within(nav).queryByRole("link", { name: "Agenda" })).not.toBeInTheDocument();
  });

  it("quien solo consulta ve las citas sin acciones", async () => {
    const api = createFakeApi(
      agendaRoutes(
        () => [cita],
        {},
        user({ roles: ["assistant"], permissions: ["appointments:read"] }),
      ),
    );
    renderApp("/agenda", api.fetch);

    await userEvent.click(await screen.findByText("Luna · Consulta general"));
    const dialog = await screen.findByRole("dialog", { name: "Luna · Consulta general" });

    expect(screen.queryByRole("button", { name: "Nueva cita" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Registrar llegada" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Cancelar cita" })).not.toBeInTheDocument();
    // Sin pets:read el nombre no es un enlace al perfil.
    expect(within(dialog).queryByRole("link", { name: "Luna" })).not.toBeInTheDocument();
  });
});

describe("calendario", () => {
  it("pide la semana en hora de Lima y muestra las citas", async () => {
    const api = createFakeApi(agendaRoutes(() => [cita]));
    renderApp("/agenda", api.fetch);

    expect(await screen.findByText("Luna · Consulta general")).toBeInTheDocument();
    const query = new URL(api.calls("GET /api/v1/appointments")[0]!.url).searchParams;
    // Semana del lunes 9 al domingo 15, de medianoche a medianoche en Lima.
    expect(query.get("from")).toBe("2026-11-09T00:00:00-05:00");
    expect(query.get("to")).toBe("2026-11-16T00:00:00-05:00");
    expect(query.get("resource_id")).toBeNull();
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
  });

  it("cambia de vista, de periodo y filtra por recurso", async () => {
    const api = createFakeApi(agendaRoutes(() => [cita]));
    renderApp("/agenda", api.fetch);
    await screen.findByText("Luna · Consulta general");
    const last = () => new URL(api.calls("GET /api/v1/appointments").at(-1)!.url).searchParams;

    await userEvent.click(screen.getByRole("button", { name: "Día" }));
    await waitFor(() => expect(last().get("from")).toBe("2026-11-12T00:00:00-05:00"));
    expect(last().get("to")).toBe("2026-11-13T00:00:00-05:00");

    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(last().get("from")).toBe("2026-11-13T00:00:00-05:00"));

    await userEvent.click(screen.getByRole("button", { name: "Hoy" }));
    await userEvent.click(screen.getByRole("button", { name: "Mes" }));
    // La vista de mes muestra semanas completas: del lunes 26 de octubre al 6 de diciembre.
    await waitFor(() => expect(last().get("from")).toBe("2026-10-26T00:00:00-05:00"));
    expect(last().get("to")).toBe("2026-12-07T00:00:00-05:00");

    await userEvent.selectOptions(screen.getByLabelText("Recurso"), vet.id);
    await waitFor(() => expect(last().get("resource_id")).toBe(vet.id));
  });

  it("oculta las canceladas hasta que se pide verlas", async () => {
    const cancelada: Appointment = {
      ...cita,
      id: "0192f0a4-0000-7000-8000-0000000000d2",
      pet_name: "Toby",
      status: "cancelled",
      start: "2026-11-12T17:00:00Z",
      end: "2026-11-12T17:30:00Z",
    };
    renderApp("/agenda", createFakeApi(agendaRoutes(() => [cita, cancelada])).fetch);

    expect(await screen.findByText("Luna · Consulta general")).toBeInTheDocument();
    expect(screen.queryByText("Toby · Consulta general")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Mostrar canceladas e inasistencias"));
    expect(await screen.findByText("Toby · Consulta general")).toBeInTheDocument();
  });

  it("muestra el error de la API con la opción de reintentar", async () => {
    let fail = true;
    const api = createFakeApi(
      agendaRoutes(() => [cita], {
        "GET /api/v1/appointments": () =>
          fail
            ? problem(422, "validation_failed", "Consulta un periodo de hasta 62 días.")
            : json([cita]),
      }),
    );
    renderApp("/agenda", api.fetch);

    expect(await screen.findByText("Consulta un periodo de hasta 62 días.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Luna · Consulta general")).toBeInTheDocument();
  });
});

describe("detalle y estados de una cita", () => {
  const open = async () => {
    await userEvent.click(await screen.findByText("Luna · Consulta general"));
    return screen.findByRole("dialog", { name: "Luna · Consulta general" });
  };

  it("muestra el detalle con quién atiende y el historial", async () => {
    renderApp("/agenda", createFakeApi(agendaRoutes(() => [cita])).fetch);
    const dialog = within(await open());

    expect(dialog.getByText("jueves, 12 de noviembre · 10:30 – 11:00")).toBeInTheDocument();
    expect(dialog.getByText("Confirmada")).toBeInTheDocument();
    expect(await dialog.findByText("Dra. Carla Rojas · Consultorio 1")).toBeInTheDocument();
    expect(dialog.getByText("Control anual")).toBeInTheDocument();
    expect(dialog.getByText("Trae su cartilla.")).toBeInTheDocument();
    expect(dialog.getByRole("link", { name: "Luna" })).toHaveAttribute(
      "href",
      `/mascotas/${luna.id}`,
    );
    expect(
      within(dialog.getByRole("list", { name: "Historial de la cita" })).getByText("Agendada"),
    ).toBeInTheDocument();
  });

  it("registra la llegada y luego completa la atención", async () => {
    let current = cita;
    const api = createFakeApi(
      agendaRoutes(() => [current], {
        [`POST /api/v1/appointments/${cita.id}/check-in`]: () =>
          json((current = { ...cita, status: "checked_in" })),
        [`POST /api/v1/appointments/${cita.id}/complete`]: () =>
          json((current = { ...cita, status: "completed" })),
      }),
    );
    renderApp("/agenda", api.fetch);
    const dialog = within(await open());

    await userEvent.click(dialog.getByRole("button", { name: "Registrar llegada" }));
    expect(await dialog.findByText("En atención")).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Cancelar cita" })).not.toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "Completar atención" }));
    expect(await dialog.findByText("Completada")).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Completar atención" })).not.toBeInTheDocument();
  });

  it("confirma una solicitud del cliente", async () => {
    let current: Appointment = { ...cita, status: "requested", channel: "client" };
    const api = createFakeApi(
      agendaRoutes(() => [current], {
        [`POST /api/v1/appointments/${cita.id}/confirm`]: () =>
          json((current = { ...cita, channel: "client" })),
      }),
    );
    renderApp("/agenda", api.fetch);
    const dialog = within(await open());

    expect(dialog.getByText("Por confirmar")).toBeInTheDocument();
    expect(dialog.getByText("Solicitada desde la app")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Confirmar" }));

    expect(await dialog.findByText("Confirmada")).toBeInTheDocument();
    expect(api.calls(`POST /api/v1/appointments/${cita.id}/confirm`)).toHaveLength(1);
  });

  it("muestra el motivo si la API rechaza la transición", async () => {
    const api = createFakeApi(
      agendaRoutes(() => [cita], {
        [`POST /api/v1/appointments/${cita.id}/check-in`]: () =>
          problem(
            409,
            "invalid_appointment_transition",
            "No se puede registrar la llegada de una cita cancelada.",
          ),
      }),
    );
    renderApp("/agenda", api.fetch);
    const dialog = within(await open());

    await userEvent.click(dialog.getByRole("button", { name: "Registrar llegada" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "No se puede registrar la llegada de una cita cancelada.",
    );
    expect(dialog.getByText("Confirmada")).toBeInTheDocument();
  });

  it("ofrece la llegada desde 2 horas antes y la inasistencia solo pasada la hora", async () => {
    // Son las 09:00. Mañana a las 10:30: ni llegada ni inasistencia.
    const manana: Appointment = {
      ...cita,
      start: "2026-11-13T15:30:00Z",
      end: "2026-11-13T16:00:00Z",
    };
    // Hoy a las 08:00, ya pasada: llegada (tardía) e inasistencia.
    const pasada: Appointment = {
      ...cita,
      id: "0192f0a4-0000-7000-8000-0000000000d3",
      pet_name: "Toby",
      start: "2026-11-12T13:00:00Z",
      end: "2026-11-12T13:30:00Z",
    };
    renderApp("/agenda", createFakeApi(agendaRoutes(() => [manana, pasada])).fetch);

    await userEvent.click(await screen.findByText("Luna · Consulta general"));
    let dialog = within(await screen.findByRole("dialog", { name: "Luna · Consulta general" }));
    expect(dialog.queryByRole("button", { name: "Registrar llegada" })).not.toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "No asistió" })).not.toBeInTheDocument();
    expect(dialog.getByText(/La llegada se registra desde 2 horas antes/)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Reprogramar" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(await screen.findByText("Toby · Consulta general"));
    dialog = within(await screen.findByRole("dialog", { name: "Toby · Consulta general" }));
    expect(dialog.getByRole("button", { name: "Registrar llegada" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "No asistió" })).toBeInTheDocument();
  });

  it("muestra el responsable con su teléfono, también en el calendario", async () => {
    const api = createFakeApi(
      agendaRoutes(() => [cita], { [`GET /api/v1/clients/${rosa.id}`]: () => json(rosa) }),
    );
    renderApp("/agenda", api.fetch);

    expect(await screen.findByText("· Rosa Quispe Mamani")).toBeInTheDocument();
    const dialog = within(await open());
    expect(await dialog.findByRole("link", { name: "Rosa Quispe Mamani" })).toHaveAttribute(
      "href",
      `/clientes/${rosa.id}`,
    );
    expect(dialog.getByRole("link", { name: "987654321" })).toHaveAttribute(
      "href",
      "tel:987654321",
    );
    // La ficha se pidió una sola vez, aunque la usan el calendario y el detalle.
    expect(api.calls(`GET /api/v1/clients/${rosa.id}`)).toHaveLength(1);
  });

  it("cancela con un motivo", async () => {
    let current = cita;
    const api = createFakeApi(
      agendaRoutes(() => [current], {
        [`POST /api/v1/appointments/${cita.id}/cancel`]: () =>
          json(
            (current = { ...cita, status: "cancelled", cancellation_reason: "La dueña viaja." }),
          ),
      }),
    );
    renderApp("/agenda", api.fetch);
    const dialog = within(await open());

    await userEvent.click(dialog.getByRole("button", { name: "Cancelar cita" }));
    await userEvent.type(
      dialog.getByLabelText("Motivo de la cancelación (opcional)"),
      "La dueña viaja.",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancelar la cita" }));

    expect(await dialog.findByText("Cancelada")).toBeInTheDocument();
    expect(await api.calls(`POST /api/v1/appointments/${cita.id}/cancel`)[0]?.json()).toEqual({
      reason: "La dueña viaja.",
    });
    // Ya no ocupa la agenda: desaparece del calendario.
    const calendar = within(document.querySelector<HTMLElement>(".agenda-calendar")!);
    await waitFor(() =>
      expect(calendar.queryByText("Luna · Consulta general")).not.toBeInTheDocument(),
    );
  });

  it("reprograma a un horario libre y muestra el conflicto si se ocupó", async () => {
    let current = cita;
    let taken = true;
    const api = createFakeApi(
      agendaRoutes(() => [current], {
        "GET /api/v1/scheduling/availability": () =>
          json([
            slot("2026-11-13T15:00:00Z", "2026-11-13T15:30:00Z"),
            slot("2026-11-13T16:00:00Z", "2026-11-13T16:30:00Z"),
          ]),
        [`POST /api/v1/appointments/${cita.id}/reschedule`]: () =>
          taken
            ? problem(409, "slot_unavailable", "El horario ya no está disponible. Elige otro.")
            : json(
                (current = {
                  ...cita,
                  start: "2026-11-13T16:00:00Z",
                  end: "2026-11-13T16:30:00Z",
                }),
              ),
      }),
    );
    renderApp("/agenda", api.fetch);
    const dialog = within(await open());

    await userEvent.click(dialog.getByRole("button", { name: "Reprogramar" }));
    await userEvent.click(dialog.getByRole("button", { name: "Guardar el nuevo horario" }));
    expect(await dialog.findByText("Elige una hora libre.")).toBeInTheDocument();

    const day = dialog.getByLabelText("Día");
    await userEvent.clear(day);
    await userEvent.type(day, "2026-11-13");
    await dialog.findByRole("option", { name: "10:00 – 10:30" });
    const availability = new URL(api.calls("GET /api/v1/scheduling/availability").at(-1)!.url);
    expect(availability.searchParams.get("date")).toBe("2026-11-13");
    expect(availability.searchParams.get("service_type_id")).toBe(consulta.id);

    await userEvent.selectOptions(dialog.getByLabelText("Hora"), "2026-11-13T15:00:00Z");
    await userEvent.click(dialog.getByRole("button", { name: "Guardar el nuevo horario" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "El horario ya no está disponible. Elige otro.",
    );

    taken = false;
    await userEvent.selectOptions(dialog.getByLabelText("Hora"), "2026-11-13T16:00:00Z");
    await userEvent.click(dialog.getByRole("button", { name: "Guardar el nuevo horario" }));

    expect(
      await screen.findByRole("dialog", { name: "Luna · Consulta general" }),
    ).toHaveTextContent("viernes, 13 de noviembre · 11:00 – 11:30");
    expect(
      await api.calls(`POST /api/v1/appointments/${cita.id}/reschedule`).at(-1)?.json(),
    ).toEqual({ start: "2026-11-13T16:00:00Z", resource_ids: [] });
  });
});

describe("nueva cita", () => {
  const bookingRoutes = (
    book: (request: Request) => Response | Promise<Response>,
    appointments: () => Appointment[] = () => [],
  ) =>
    agendaRoutes(appointments, {
      "GET /api/v1/clients": () => json({ items: [rosa], total: 1, page: 1, page_size: 20 }),
      [`GET /api/v1/clients/${rosa.id}/pets`]: () =>
        json([
          luna,
          { ...luna, id: "0192f0a4-0000-7000-8000-00000000e002", name: "Rex", status: "deceased" },
        ]),
      "GET /api/v1/scheduling/availability": () =>
        json([
          slot("2026-11-12T15:30:00Z", "2026-11-12T16:00:00Z"),
          slot("2026-11-12T16:00:00Z", "2026-11-12T16:30:00Z"),
        ]),
      "POST /api/v1/appointments": book,
    });

  const fill = async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Nueva cita" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Nueva cita" }));
    await userEvent.type(dialog.getByLabelText("Cliente"), "rosa");
    await userEvent.click(await dialog.findByRole("button", { name: /Rosa Quispe Mamani/ }));
    await dialog.findByRole("option", { name: "Luna" });
    await userEvent.selectOptions(dialog.getByLabelText("Mascota"), luna.id);
    await userEvent.selectOptions(dialog.getByLabelText("Servicio"), consulta.id);
    await dialog.findByRole("option", { name: "10:30 – 11:00" });
    return dialog;
  };

  it("exige cliente, mascota, servicio y hora", async () => {
    const api = createFakeApi(bookingRoutes(() => json(cita, 201)));
    renderApp("/agenda", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Nueva cita" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Nueva cita" }));
    await userEvent.click(dialog.getByRole("button", { name: "Agendar cita" }));

    expect(await dialog.findByText("Busca y elige al cliente.")).toBeInTheDocument();
    expect(dialog.getByText("Elige la mascota.")).toBeInTheDocument();
    expect(dialog.getByText("Elige el servicio.")).toBeInTheDocument();
    expect(dialog.getByText("Elige una hora libre.")).toBeInTheDocument();
    expect(api.calls("POST /api/v1/appointments")).toHaveLength(0);
  });

  it("agenda con una mascota activa, un horario libre y el veterinario elegido", async () => {
    let booked: Appointment[] = [];
    const api = createFakeApi(
      bookingRoutes(
        () => {
          booked = [cita];
          return json(cita, 201);
        },
        () => booked,
      ),
    );
    renderApp("/agenda", api.fetch);
    const dialog = await fill();

    // Las mascotas que ya no están activas no se ofrecen.
    expect(dialog.queryByRole("option", { name: "Rex" })).not.toBeInTheDocument();
    await userEvent.selectOptions(dialog.getByLabelText("Hora"), "2026-11-12T15:30:00Z");
    await userEvent.selectOptions(dialog.getByLabelText("Veterinario (opcional)"), vet.id);
    await userEvent.type(dialog.getByLabelText("Motivo (opcional)"), "Control anual");
    await userEvent.click(dialog.getByRole("button", { name: "Agendar cita" }));

    expect(
      await screen.findByText("Cita agendada para Luna: jueves, 12 de noviembre · 10:30 – 11:00."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Luna · Consulta general")).toBeInTheDocument();

    const request = api.calls("POST /api/v1/appointments")[0]!;
    expect(request.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await request.json()).toEqual({
      pet_id: luna.id,
      service_type_id: consulta.id,
      start: "2026-11-12T15:30:00Z",
      client_id: rosa.id,
      resource_ids: [vet.id],
      reason: "Control anual",
      notes: null,
    });
  });

  it("si el horario se ocupó, avisa, pide elegir otro y reintenta con la misma clave", async () => {
    let taken = true;
    const api = createFakeApi(
      bookingRoutes(() =>
        taken
          ? problem(409, "slot_unavailable", "El horario ya no está disponible. Elige otro.")
          : json(cita, 201),
      ),
    );
    renderApp("/agenda", api.fetch);
    const dialog = await fill();

    await userEvent.selectOptions(dialog.getByLabelText("Hora"), "2026-11-12T15:30:00Z");
    await userEvent.click(dialog.getByRole("button", { name: "Agendar cita" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "El horario ya no está disponible. Elige otro.",
    );
    await waitFor(() => expect(dialog.getByLabelText("Hora")).toHaveValue(""));

    taken = false;
    await dialog.findByRole("option", { name: "11:00 – 11:30" });
    await userEvent.selectOptions(dialog.getByLabelText("Hora"), "2026-11-12T16:00:00Z");
    await userEvent.click(dialog.getByRole("button", { name: "Agendar cita" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [first, second] = api.calls("POST /api/v1/appointments");
    expect(second?.headers.get("Idempotency-Key")).toBe(first?.headers.get("Idempotency-Key"));
  });
});
