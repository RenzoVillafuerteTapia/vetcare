import * as SecureStore from "expo-secure-store";
import { screen } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { cita, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("una cita confirmada a menos de 2 horas no se cambia desde la app", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  // Hoy a las 10:30 en Lima; son las 09:00.
  const pronto = { ...cita, start: "2026-11-12T15:30:00Z", end: "2026-11-12T16:00:00Z" };
  await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/appointments": () => json([]),
      "GET /api/v1/me/pets": () => json([luna]),
      [`GET /api/v1/appointments/${cita.id}`]: () => json(pronto),
    },
    "/",
    { now: NOW },
  );
  await goTo(`/citas/${cita.id}`);

  expect(
    await screen.findByText(
      "Para cambiar o cancelar con menos de 2 horas de anticipación, comunícate con la veterinaria.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Reprogramar" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Cancelar cita" })).not.toBeOnTheScreen();
});
