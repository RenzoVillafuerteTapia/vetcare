import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { admin, createFakeApi, json, problem, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

import type { Calendar, Resource, ServiceType } from "./labels";

function signedIn(currentUser = admin()) {
  return {
    "POST /api/v1/auth/refresh": () => tokens(),
    "GET /api/v1/auth/me": () => json(currentUser),
  };
}

const consulta: ServiceType = {
  id: "0192f0a4-0000-7000-8000-0000000000a1",
  code: "consulta",
  name: "Consulta general",
  category: "consultation",
  duration_minutes: 30,
  required_resources: ["consultation_room", "veterinarian"],
  bookable_by_client: true,
  description: "",
  active: true,
};

const cirugia: ServiceType = {
  ...consulta,
  id: "0192f0a4-0000-7000-8000-0000000000a2",
  code: "esterilizacion",
  name: "Esterilización",
  category: "surgery",
  duration_minutes: 90,
  required_resources: ["operating_room", "veterinarian"],
  bookable_by_client: false,
  active: false,
};

const veterinaria: Resource = {
  id: "0192f0a4-0000-7000-8000-0000000000b1",
  kind: "veterinarian",
  name: "Veterinaria 1",
  user_id: "0192f0a4-0000-7000-8000-0000000000c1",
  active: true,
  schedule: [
    { weekday: 0, start: "09:00:00", end: "13:00:00" },
    { weekday: 0, start: "14:00:00", end: "19:00:00" },
  ],
  time_off: [
    {
      id: "0192f0a4-0000-7000-8000-0000000000d1",
      start: "2026-12-24T14:00:00Z",
      end: "2026-12-26T05:00:00Z",
      reason: "Vacaciones",
    },
  ],
};

const calendar: Calendar = {
  timezone: "America/Lima",
  opening_hours: [{ weekday: 0, start: "09:00:00", end: "19:00:00" }],
  holidays: [{ day: "2026-12-25", name: "Navidad" }],
};

describe("acceso a la configuración", () => {
  it("sin clinic_setup:manage no se ve ni se abre", async () => {
    renderApp("/configuracion/servicios", createFakeApi(signedIn(user())).fetch);

    expect(
      await screen.findByRole("heading", { name: "No tienes acceso a esta sección" }),
    ).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation", { name: "Principal" })[0]!;
    expect(within(nav).queryByRole("link", { name: "Configuración" })).not.toBeInTheDocument();
  });

  it("la administración entra por el menú y llega al catálogo", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/service-types": () => json([consulta]),
    });
    const { router } = renderApp("/", api.fetch);

    const nav = (await screen.findAllByRole("navigation", { name: "Principal" }))[0]!;
    await userEvent.click(within(nav).getByRole("link", { name: "Configuración" }));

    expect(await screen.findByRole("heading", { name: "Consulta general" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/configuracion/servicios");
  });
});

describe("catálogo de servicios", () => {
  it("muestra el estado vacío", async () => {
    renderApp(
      "/configuracion/servicios",
      createFakeApi({ ...signedIn(), "GET /api/v1/clinic/service-types": () => json([]) }).fetch,
    );

    expect(
      await screen.findByRole("heading", { name: "Todavía no hay servicios" }),
    ).toBeInTheDocument();
  });

  it("muestra el error de la API y permite reintentar", async () => {
    let attempts = 0;
    renderApp(
      "/configuracion/servicios",
      createFakeApi({
        ...signedIn(),
        "GET /api/v1/clinic/service-types": () =>
          attempts++ === 0
            ? problem(403, "permission_denied", "No tienes acceso al catálogo de servicios.")
            : json([consulta]),
      }).fetch,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tienes acceso al catálogo de servicios.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Consulta general" })).toBeInTheDocument();
  });

  it("lista los servicios con su duración, recursos y estado", async () => {
    renderApp(
      "/configuracion/servicios",
      createFakeApi({
        ...signedIn(),
        "GET /api/v1/clinic/service-types": () => json([consulta, cirugia]),
      }).fetch,
    );

    const item = (await screen.findByRole("heading", { name: "Esterilización" })).closest("li")!;
    expect(within(item).getByText("1 h 30 min · Quirófano + Veterinario")).toBeInTheDocument();
    expect(within(item).getByText("Inactivo")).toBeInTheDocument();
    expect(within(item).getByText("Solo personal")).toBeInTheDocument();
  });

  it("valida en español y crea el servicio", async () => {
    const created: ServiceType[] = [];
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/service-types": () => json(created),
      "POST /api/v1/clinic/service-types": async (request) => {
        const body = (await request.json()) as Omit<ServiceType, "id" | "active">;
        created.push({ ...body, id: "0192f0a4-0000-7000-8000-0000000000a9", active: true });
        return json(created[0], 201);
      },
    });
    renderApp("/configuracion/servicios", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Nuevo servicio" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuevo servicio" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear servicio" }));

    expect(await within(dialog).findByText("Ingresa el nombre del servicio.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Elige al menos un recurso que ocupe el servicio."),
    ).toBeInTheDocument();
    expect(api.calls("POST /api/v1/clinic/service-types")).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText("Nombre"), "Baño medicado");
    await userEvent.type(within(dialog).getByLabelText("Código"), "bano-medicado");
    await userEvent.selectOptions(within(dialog).getByLabelText("Categoría"), "grooming");
    await userEvent.clear(within(dialog).getByLabelText("Duración (minutos)"));
    await userEvent.type(within(dialog).getByLabelText("Duración (minutos)"), "45");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Groomer" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Estación de baño" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear servicio" }));

    expect(await screen.findByRole("heading", { name: "Baño medicado" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await api.calls("POST /api/v1/clinic/service-types")[0]?.json()).toEqual({
      code: "bano-medicado",
      name: "Baño medicado",
      category: "grooming",
      duration_minutes: 45,
      required_resources: ["groomer", "grooming_station"],
      bookable_by_client: true,
      description: "",
    });
  });

  it("marca el código si ya existe y los errores 422 junto a su campo", async () => {
    const responses = [
      problem(409, "code_taken", "Ya existe un servicio con ese código."),
      problem(422, "validation_failed", "Datos inválidos.", [
        { field: "duration_minutes", message: "Usa entre 5 y 600 minutos, en múltiplos de 5." },
      ]),
    ];
    renderApp(
      "/configuracion/servicios",
      createFakeApi({
        ...signedIn(),
        "GET /api/v1/clinic/service-types": () => json([]),
        "POST /api/v1/clinic/service-types": () => responses.shift()!,
      }).fetch,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Nuevo servicio" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Nombre"), "Consulta");
    await userEvent.type(within(dialog).getByLabelText("Código"), "consulta");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Veterinario" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear servicio" }));

    expect(
      await within(dialog).findByText("Ya existe un servicio con ese código."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");

    await userEvent.type(within(dialog).getByLabelText("Código"), "-2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear servicio" }));

    expect(
      await within(dialog).findByText("Usa entre 5 y 600 minutos, en múltiplos de 5."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Duración (minutos)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("edita sin enviar el código y activa o desactiva", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/service-types": () => json([consulta]),
      [`PUT /api/v1/clinic/service-types/${consulta.id}`]: () => json(consulta),
      [`PATCH /api/v1/clinic/service-types/${consulta.id}/active`]: () =>
        json({ ...consulta, active: false }),
    });
    renderApp("/configuracion/servicios", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Editar Consulta general" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar servicio" });
    expect(within(dialog).getByLabelText("Código")).toHaveAttribute("readonly");
    await userEvent.clear(within(dialog).getByLabelText("Nombre"));
    await userEvent.type(within(dialog).getByLabelText("Nombre"), "Consulta médica");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.calls(`PUT /api/v1/clinic/service-types/${consulta.id}`)[0]?.json()).toEqual({
      name: "Consulta médica",
      category: "consultation",
      duration_minutes: 30,
      required_resources: ["consultation_room", "veterinarian"],
      bookable_by_client: true,
      description: "",
    });

    await userEvent.click(screen.getByRole("button", { name: "Desactivar Consulta general" }));
    await waitFor(() =>
      expect(api.calls(`PATCH /api/v1/clinic/service-types/${consulta.id}/active`)).toHaveLength(1),
    );
    expect(
      await api.calls(`PATCH /api/v1/clinic/service-types/${consulta.id}/active`)[0]?.json(),
    ).toEqual({ active: false });
  });
});

describe("recursos", () => {
  it("lista el horario y los bloqueos en hora de la sede", async () => {
    renderApp(
      "/configuracion/recursos",
      createFakeApi({ ...signedIn(), "GET /api/v1/clinic/resources": () => json([veterinaria]) })
        .fetch,
    );

    const item = (await screen.findByRole("heading", { name: "Veterinaria 1" })).closest("li")!;
    expect(within(item).getByText("Lunes: 09:00–13:00, 14:00–19:00")).toBeInTheDocument();
    // 14:00 UTC del 24 son las 09:00 en Lima; 05:00 UTC del 26 son las 00:00 del 26.
    expect(within(item).getByText(/24 dic.* 09:00/)).toBeInTheDocument();
    expect(within(item).getByText(/Vacaciones/)).toBeInTheDocument();
  });

  it("no envía un horario con franjas superpuestas y crea el recurso al corregirlo", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/resources": () => json([]),
      "POST /api/v1/clinic/resources": () => json(veterinaria, 201),
    });
    renderApp("/configuracion/recursos", api.fetch);

    expect(
      await screen.findByRole("heading", { name: "Todavía no hay recursos" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nuevo recurso" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuevo recurso" });
    await userEvent.type(within(dialog).getByLabelText("Nombre"), "Estación 2");
    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo"), "grooming_station");

    const addMonday = within(dialog).getByRole("button", { name: "Agregar franja el lunes" });
    await userEvent.click(addMonday);
    fireEvent.change(within(dialog).getByLabelText("Lunes, franja 1, fin"), {
      target: { value: "13:00" },
    });
    await userEvent.click(addMonday);
    fireEvent.change(within(dialog).getByLabelText("Lunes, franja 2, inicio"), {
      target: { value: "12:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Lunes, franja 2, fin"), {
      target: { value: "18:00" },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear recurso" }));

    expect(await within(dialog).findByText("El lunes tiene franjas superpuestas.")).toBeVisible();
    expect(api.calls("POST /api/v1/clinic/resources")).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText("Lunes, franja 2, inicio"), {
      target: { value: "14:00" },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear recurso" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.calls("POST /api/v1/clinic/resources")[0]?.json()).toEqual({
      kind: "grooming_station",
      name: "Estación 2",
      schedule: [
        { weekday: 0, start: "09:00", end: "13:00" },
        { weekday: 0, start: "14:00", end: "18:00" },
      ],
    });
  });

  it("al editar conserva el tipo y la cuenta vinculada", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/resources": () => json([veterinaria]),
      [`PUT /api/v1/clinic/resources/${veterinaria.id}`]: () => json(veterinaria),
    });
    renderApp("/configuracion/recursos", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Editar Veterinaria 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar recurso" });
    expect(within(dialog).getByLabelText("Tipo")).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Activo/ }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Quitar la franja 2 del lunes" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.calls(`PUT /api/v1/clinic/resources/${veterinaria.id}`)[0]?.json()).toEqual({
      name: "Veterinaria 1",
      schedule: [{ weekday: 0, start: "09:00", end: "13:00" }],
      active: false,
      user_id: veterinaria.user_id,
    });
  });

  it("bloquea con la hora de la sede, muestra el conflicto y quita bloqueos", async () => {
    const timeOff = `/api/v1/clinic/resources/${veterinaria.id}/time-off`;
    const responses = [
      problem(409, "time_off_overlap", "Ya hay un bloqueo en ese periodo."),
      json(veterinaria, 201),
    ];
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/resources": () => json([veterinaria]),
      [`POST ${timeOff}`]: () => responses.shift()!,
      [`DELETE ${timeOff}/${veterinaria.time_off[0]!.id}`]: () =>
        json({ ...veterinaria, time_off: [] }),
    });
    renderApp("/configuracion/recursos", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Bloquear Veterinaria 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Bloquear a Veterinaria 1" });
    fireEvent.change(within(dialog).getByLabelText("Desde"), {
      target: { value: "2027-01-10T09:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Hasta"), {
      target: { value: "2027-01-09T09:00" },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Bloquear" }));
    expect(await within(dialog).findByText("Debe ser posterior al inicio.")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Hasta"), {
      target: { value: "2027-01-12T19:00" },
    });
    await userEvent.type(within(dialog).getByLabelText("Motivo (opcional)"), "Congreso");
    await userEvent.click(within(dialog).getByRole("button", { name: "Bloquear" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Ya hay un bloqueo en ese periodo.",
    );

    await userEvent.click(within(dialog).getByRole("button", { name: "Bloquear" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.calls(`POST ${timeOff}`)[0]?.json()).toEqual({
      start: "2027-01-10T09:00:00-05:00",
      end: "2027-01-12T19:00:00-05:00",
      reason: "Congreso",
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Quitar el bloqueo de Veterinaria 1/ }),
    );
    await waitFor(() =>
      expect(api.calls(`DELETE ${timeOff}/${veterinaria.time_off[0]!.id}`)).toHaveLength(1),
    );
  });
});

describe("horario y feriados", () => {
  it("guarda el horario de atención con horas HH:MM", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/calendar": () => json(calendar),
      "PUT /api/v1/clinic/calendar/opening-hours": () => json(calendar),
    });
    renderApp("/configuracion/horario", api.fetch);

    expect(await screen.findByLabelText("Lunes, franja 1, inicio")).toHaveValue("09:00");
    expect(screen.getAllByText("Cerrado")).toHaveLength(6);

    await userEvent.click(screen.getByRole("button", { name: "Agregar franja el sábado" }));
    fireEvent.change(screen.getByLabelText("Sábado, franja 1, fin"), {
      target: { value: "14:00" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(await screen.findByText("Horario guardado")).toBeInTheDocument();
    expect(await api.calls("PUT /api/v1/clinic/calendar/opening-hours")[0]?.json()).toEqual({
      opening_hours: [
        { weekday: 0, start: "09:00", end: "19:00" },
        { weekday: 5, start: "09:00", end: "14:00" },
      ],
    });
  });

  it("no guarda un horario con una franja incompleta", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/calendar": () => json(calendar),
    });
    renderApp("/configuracion/horario", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Agregar franja el martes" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(await screen.findByText("Completa las horas del martes.")).toBeInTheDocument();
    expect(api.calls("PUT /api/v1/clinic/calendar/opening-hours")).toHaveLength(0);
  });

  it("agrega y quita feriados, y marca la fecha repetida", async () => {
    const withNewYear: Calendar = {
      ...calendar,
      holidays: [...calendar.holidays, { day: "2027-01-01", name: "Año Nuevo" }],
    };
    const responses = [
      problem(409, "holiday_exists", "Ese día ya está registrado como feriado."),
      json(withNewYear, 201),
    ];
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/clinic/calendar": () => json(calendar),
      "POST /api/v1/clinic/calendar/holidays": () => responses.shift()!,
      "DELETE /api/v1/clinic/calendar/holidays/2026-12-25": () =>
        json({ ...withNewYear, holidays: withNewYear.holidays.slice(1) }),
    });
    renderApp("/configuracion/horario", api.fetch);

    expect(await screen.findByText("Navidad")).toBeInTheDocument();
    expect(screen.getByText(/viernes, 25 de diciembre de 2026/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Agregar feriado" }));
    expect(await screen.findByText("Elige la fecha.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-12-25" } });
    await userEvent.type(screen.getByLabelText("Nombre"), "Año Nuevo");
    await userEvent.click(screen.getByRole("button", { name: "Agregar feriado" }));
    expect(await screen.findByText("Ese día ya está registrado como feriado.")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2027-01-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Agregar feriado" }));
    expect(await screen.findByText("Año Nuevo")).toBeInTheDocument();
    expect(await api.calls("POST /api/v1/clinic/calendar/holidays")[1]?.json()).toEqual({
      day: "2027-01-01",
      name: "Año Nuevo",
    });
    expect(screen.getByLabelText("Fecha")).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: "Quitar el feriado Navidad" }));
    await waitFor(() => expect(screen.queryByText("Navidad")).not.toBeInTheDocument());
  });
});
