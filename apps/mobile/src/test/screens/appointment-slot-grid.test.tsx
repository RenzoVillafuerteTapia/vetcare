import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { consulta, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("muestra el día como una sala de cine: los ocupados se ven y no se eligen", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([]),
      "GET /api/v1/clinic/service-types": () => json([consulta]),
      "GET /api/v1/scheduling/availability": () =>
        json([
          { start: "2026-11-12T14:30:00Z", end: "2026-11-12T15:00:00Z", status: "too_soon" },
          { start: "2026-11-12T15:00:00Z", end: "2026-11-12T15:30:00Z", status: "taken" },
          { start: "2026-11-12T15:30:00Z", end: "2026-11-12T16:00:00Z", status: "free" },
          { start: "2026-11-12T19:00:00Z", end: "2026-11-12T19:30:00Z", status: "free" },
        ]),
    },
    "/",
    { now: NOW },
  );
  await goTo(`/citas/nueva?serviceId=${consulta.id}`);
  await fireEvent.press(await screen.findByRole("button", { name: "Siguiente" }));

  // Leyenda, conteo y grupos por momento del día.
  expect(await screen.findByText("2 horarios libres de 4")).toBeOnTheScreen();
  for (const label of [
    "Libre",
    "Elegido",
    "Ocupado",
    "Muy pronto",
    "Por la mañana",
    "Por la tarde",
  ]) {
    expect(screen.getByText(label)).toBeOnTheScreen();
  }
  const ocupado = screen.getByRole("radio", { name: "10:00" });
  expect(ocupado).toBeDisabled();
  expect(screen.getByRole("radio", { name: "09:30" })).toBeDisabled();

  // Tocar un ocupado no lo elige; un libre sí.
  await fireEvent.press(ocupado);
  expect(ocupado).not.toBeChecked();
  await fireEvent.press(screen.getByRole("radio", { name: "10:30" }));
  expect(screen.getByRole("radio", { name: "10:30" })).toBeChecked();

  // Se pide el día completo.
  await waitFor(() =>
    expect(
      api
        .calls("GET /api/v1/scheduling/availability")
        .map((r) => new URL(r.url).searchParams.get("include_unavailable")),
    ).toContain("true"),
  );
});
