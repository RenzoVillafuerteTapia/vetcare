import * as SecureStore from "expo-secure-store";
import { fireEvent, screen } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { anterior, cita, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("lista las próximas citas y las anteriores, y abre el detalle", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([anterior, cita]),
      [`GET /api/v1/appointments/${cita.id}`]: () => json(cita),
    },
    "/",
    { now: NOW },
  );
  await goTo("/citas");

  // Próximas e historial van en pestañas separadas, con su cantidad.
  expect(await screen.findByRole("tab", { name: "Próximas (1)" })).toBeOnTheScreen();
  expect(
    await screen.findByRole("button", {
      name: "Cita de Luna: Consulta general, viernes 13 de noviembre · 10:30 – 11:00",
    }),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Completada")).not.toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("tab", { name: "Historial (1)" }));
  expect(
    await screen.findByRole("button", {
      name: "Cita de Luna: Vacunación, lunes 12 de octubre · 10:00 – 10:15",
    }),
  ).toBeOnTheScreen();
  expect(screen.getByText("Completada")).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("tab", { name: "Próximas (1)" }));
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "Cita de Luna: Consulta general, viernes 13 de noviembre · 10:30 – 11:00",
    }),
  );
  expect(await screen.findByText("Control anual")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Reprogramar" })).toBeOnTheScreen();
});
