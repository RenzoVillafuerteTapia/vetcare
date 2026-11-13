import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { cita, consulta, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

const TORRES = { id: "0192f0a4-0000-7000-8000-0000000000f1", name: "Dra. Torres" };
const RAMOS = { id: "0192f0a4-0000-7000-8000-0000000000f2", name: "Dr. Ramos" };
const CONSULTORIO = "0192f0a4-0000-7000-8000-0000000000f9";

it("propone al veterinario de la última cita y solo muestra sus horarios", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  // Luna se atendió con el Dr. Ramos la semana pasada.
  const anterior = {
    ...cita,
    status: "completed" as const,
    start: "2026-11-05T15:00:00Z",
    end: "2026-11-05T15:30:00Z",
    resource_ids: [CONSULTORIO, RAMOS.id],
  };
  const solicitada = { ...cita, status: "requested" as const, resource_ids: [TORRES.id] };
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([anterior]),
      "GET /api/v1/clinic/service-types": () => json([consulta]),
      "GET /api/v1/scheduling/professionals": () =>
        json([
          { ...TORRES, kind: "veterinarian" },
          { ...RAMOS, kind: "veterinarian" },
        ]),
      "GET /api/v1/scheduling/availability": () =>
        json([{ start: "2026-11-13T16:00:00Z", end: "2026-11-13T16:30:00Z" }]),
      "POST /api/v1/appointments": () => json(solicitada, 201),
      [`GET /api/v1/appointments/${cita.id}`]: () => json(solicitada),
    },
    "/",
    { now: NOW },
  );
  await goTo(`/citas/nueva?serviceId=${consulta.id}`);
  await fireEvent.press(await screen.findByRole("button", { name: "Siguiente" }));

  // Paso 2: el Dr. Ramos ya viene elegido y los horarios son solo los suyos.
  expect(await screen.findByRole("radio", { name: "Dr. Ramos" })).toBeChecked();
  expect(screen.getByText("Solo verás los horarios libres de este profesional.")).toBeOnTheScreen();
  expect(
    screen.getByText("Hoy puedes pedir hora desde 30 minutos después de ahora."),
  ).toBeOnTheScreen();
  const pedidos = () =>
    api
      .calls("GET /api/v1/scheduling/availability")
      .map((r) => new URL(r.url).searchParams.get("professional_id"));
  await waitFor(() => expect(pedidos()).toContain(RAMOS.id));

  // "Cualquiera" ve todos los horarios; luego elige a la Dra. Torres.
  await fireEvent.press(screen.getByRole("radio", { name: "Cualquiera" }));
  await waitFor(() => expect(pedidos()).toContain(null));
  await fireEvent.press(screen.getByRole("radio", { name: "Dra. Torres" }));
  await waitFor(() => expect(pedidos()).toContain(TORRES.id));

  await fireEvent.press(screen.getByRole("radio", { name: "Mañana" }));
  await fireEvent.press(await screen.findByRole("radio", { name: "11:00" }));
  await fireEvent.press(screen.getByRole("button", { name: "Siguiente" }));

  // Paso 3: el resumen dice quién atiende y la solicitud lo fija.
  expect(await screen.findByText("Atiende")).toBeOnTheScreen();
  expect(screen.getByText("Dra. Torres")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(
    await screen.findByText("Solicitud enviada. La veterinaria la confirmará y te avisaremos."),
  ).toBeOnTheScreen();
  const [envio] = api.calls("POST /api/v1/appointments");
  expect((await envio?.json()).resource_ids).toEqual([TORRES.id]);
  // El detalle muestra quién atiende.
  expect(await screen.findByText("Dra. Torres")).toBeOnTheScreen();
});
