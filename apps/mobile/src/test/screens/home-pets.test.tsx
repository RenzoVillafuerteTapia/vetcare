import * as SecureStore from "expo-secure-store";
import { fireEvent, screen } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { anterior, cita, luna, NOW, REFRESH_KEY, signedIn, toby } from "@/test/fixtures";
import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("el inicio muestra la próxima cita y las mascotas, y abre el perfil compartido", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna, toby]),
      "GET /api/v1/me/appointments": () => json([anterior, cita]),
      [`GET /api/v1/pets/${luna.id}`]: () => json(luna),
    },
    "/",
    { now: NOW },
  );

  // La próxima cita es la confirmada de mañana, no la ya completada.
  expect(
    await screen.findByRole("button", {
      name: "Cita de Luna: Consulta general, viernes 13 de noviembre · 10:30 – 11:00",
    }),
  ).toBeOnTheScreen();
  expect(screen.getByText("Confirmada")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Perfil de Toby" })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Perfil de Luna" }));

  expect(await screen.findByRole("header", { name: "Luna" })).toBeOnTheScreen();
  expect(screen.getByText("Perro · Schnauzer · Hembra")).toBeOnTheScreen();
  expect(screen.getByText("15 de marzo de 2021 (aproximada)")).toBeOnTheScreen();
  expect(screen.getByText("7.85 kg · martes 20 de octubre")).toBeOnTheScreen();
  expect(screen.getByText("Pollo")).toBeOnTheScreen();
  expect(screen.getByText("Luis Torres")).toBeOnTheScreen();
  expect(screen.getByText("Responsable autorizado")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Solicitar cita para Luna" })).toBeOnTheScreen();
});
