import * as SecureStore from "expo-secure-store";
import { act, screen } from "expo-router/testing-library";

import { APPOINTMENTS_REFRESH_MS } from "@/lib/query-client";
import { json } from "@/test/fake-api";
import { cita, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("con la app abierta, las citas se actualizan solas cuando la veterinaria confirma", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let status: "requested" | "confirmed" = "requested";
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([{ ...cita, status }]),
    },
    "/",
    { now: NOW },
  );
  await goTo("/citas");
  expect(await screen.findByText("Por confirmar")).toBeOnTheScreen();
  const before = api.calls("GET /api/v1/me/appointments").length;

  // La recepción confirma desde la web; nadie toca el teléfono.
  status = "confirmed";
  await act(async () => {
    jest.advanceTimersByTime(APPOINTMENTS_REFRESH_MS);
  });

  expect(await screen.findByText("Confirmada")).toBeOnTheScreen();
  expect(screen.queryByText("Por confirmar")).not.toBeOnTheScreen();
  expect(api.calls("GET /api/v1/me/appointments").length).toBeGreaterThan(before);
});
