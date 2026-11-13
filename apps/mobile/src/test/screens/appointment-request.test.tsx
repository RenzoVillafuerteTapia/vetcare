import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { json, problem } from "@/test/fake-api";
import { cita, consulta, luna, NOW, REFRESH_KEY, signedIn, toby } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("solicita una cita entre los horarios libres y reintenta con la misma clave", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let taken = true;
  const solicitada = {
    ...cita,
    status: "requested" as const,
    channel: "client" as const,
    start: "2026-11-13T16:00:00Z",
    end: "2026-11-13T16:30:00Z",
  };
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna, { ...toby, status: "deceased" }]),
      "GET /api/v1/me/appointments": () => json([]),
      "GET /api/v1/clinic/service-types": () =>
        json([consulta, { ...consulta, id: "inactivo", name: "Cirugía", active: false }]),
      "GET /api/v1/scheduling/availability": () =>
        json([
          { start: "2026-11-13T15:30:00Z", end: "2026-11-13T16:00:00Z" },
          { start: "2026-11-13T16:00:00Z", end: "2026-11-13T16:30:00Z" },
        ]),
      "POST /api/v1/appointments": () =>
        taken
          ? problem(409, "slot_unavailable", "El horario ya no está disponible. Elige otro.")
          : json(solicitada, 201),
      [`GET /api/v1/appointments/${cita.id}`]: () => json(solicitada),
    },
    "/",
    { now: NOW },
  );
  await goTo("/citas/nueva");

  expect(await screen.findByRole("header", { name: "Solicitar una cita" })).toBeOnTheScreen();
  // Solo mascotas activas y servicios activos.
  expect(await screen.findByRole("radio", { name: "Luna" })).toBeOnTheScreen();
  expect(screen.queryByRole("radio", { name: "Toby" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("radio", { name: "Cirugía" })).not.toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(await screen.findByText("Elige la mascota.")).toBeOnTheScreen();
  expect(screen.getByText("Elige el servicio.")).toBeOnTheScreen();
  expect(api.calls("POST /api/v1/appointments")).toHaveLength(0);

  await fireEvent.press(screen.getByRole("radio", { name: "Luna" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Consulta general" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Mañana" }));
  await fireEvent.press(await screen.findByRole("radio", { name: "10:30" }));
  await fireEvent.changeText(screen.getByLabelText("Motivo (opcional)"), "Tose de noche");
  await fireEvent.press(screen.getByRole("button", { name: "Enviar solicitud" }));

  expect(
    await screen.findByText("El horario ya no está disponible. Elige otro."),
  ).toBeOnTheScreen();
  // Primero hoy (el día por defecto) y luego mañana, siempre para el servicio elegido.
  const queried = api
    .calls("GET /api/v1/scheduling/availability")
    .map((request) => new URL(request.url).searchParams);
  expect(queried.map((query) => query.get("date"))).toEqual(
    expect.arrayContaining(["2026-11-12", "2026-11-13"]),
  );
  expect(new Set(queried.map((query) => query.get("service_type_id")))).toEqual(
    new Set([consulta.id]),
  );

  taken = false;
  await fireEvent.press(await screen.findByRole("radio", { name: "11:00" }));
  await fireEvent.press(screen.getByRole("button", { name: "Enviar solicitud" }));
  await waitFor(() => expect(api.calls("POST /api/v1/appointments")).toHaveLength(2));

  expect(
    await screen.findByText("Solicitud enviada. La veterinaria la confirmará y te avisaremos."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Por confirmar")).toBeOnTheScreen();

  const [first, second] = api.calls("POST /api/v1/appointments");
  expect(second?.headers.get("Idempotency-Key")).toBe(first?.headers.get("Idempotency-Key"));
  expect(await second?.json()).toEqual({
    pet_id: luna.id,
    service_type_id: consulta.id,
    start: "2026-11-13T16:00:00Z",
    reason: "Tose de noche",
  });
  await waitFor(() => expect(api.calls("GET /api/v1/me/appointments").length).toBeGreaterThan(0));
});
