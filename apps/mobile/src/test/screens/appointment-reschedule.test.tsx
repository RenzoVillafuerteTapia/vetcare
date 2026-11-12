import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { cita, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("reprograma a otro horario libre, que queda por confirmar", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let current = cita;
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([current]),
      [`GET /api/v1/appointments/${cita.id}`]: () => json(current),
      "GET /api/v1/scheduling/availability": () =>
        json([{ start: "2026-11-14T14:00:00Z", end: "2026-11-14T14:30:00Z" }]),
      [`POST /api/v1/appointments/${cita.id}/reschedule`]: () =>
        json(
          (current = {
            ...cita,
            status: "requested",
            start: "2026-11-14T14:00:00Z",
            end: "2026-11-14T14:30:00Z",
          }),
        ),
    },
    "/",
    { now: NOW },
  );
  await goTo(`/citas/reprogramar/${cita.id}`);
  expect(await screen.findByRole("header", { name: "Reprogramar" })).toBeOnTheScreen();

  await fireEvent.press(await screen.findByRole("button", { name: "Solicitar el nuevo horario" }));
  expect(await screen.findByText("Elige una hora libre.")).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("radio", { name: "sáb 14" }));
  await fireEvent.press(await screen.findByRole("radio", { name: "09:00" }));
  await fireEvent.press(screen.getByRole("button", { name: "Solicitar el nuevo horario" }));
  await waitFor(() =>
    expect(api.calls(`POST /api/v1/appointments/${cita.id}/reschedule`)).toHaveLength(1),
  );

  expect(
    await screen.findByText("Nuevo horario solicitado. La veterinaria lo confirmará."),
  ).toBeOnTheScreen();
  expect(screen.getByText("sábado 14 de noviembre · 09:00 – 09:30")).toBeOnTheScreen();
  expect(screen.getByText("Por confirmar")).toBeOnTheScreen();
  expect(await api.calls(`POST /api/v1/appointments/${cita.id}/reschedule`)[0]?.json()).toEqual({
    start: "2026-11-14T14:00:00Z",
    resource_ids: [],
  });
});
