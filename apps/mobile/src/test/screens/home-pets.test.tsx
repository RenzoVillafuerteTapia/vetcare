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

  // Accesos rápidos a lo más usado.
  expect(screen.getByRole("button", { name: "Solicitar cita" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Horario" })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Perfil de Luna" }));

  // La ficha se divide en secciones para no desplazarse tanto: primero los datos.
  expect(await screen.findByRole("header", { name: "Luna" })).toBeOnTheScreen();
  expect(screen.getByText("Perro · Schnauzer")).toBeOnTheScreen();
  expect(screen.getByText("Hembra")).toBeOnTheScreen();
  expect(screen.getByText("15 de marzo de 2021 (aprox.)")).toBeOnTheScreen();
  expect(screen.getByText("7.85 kg")).toBeOnTheScreen();
  expect(screen.getByText("Pollo")).toBeOnTheScreen();
  expect(screen.queryByText("Luis Torres")).not.toBeOnTheScreen();
  // Ana es dueña: puede cambiar la foto.
  expect(screen.getByRole("button", { name: "Cambiar la foto de Luna" })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("tab", { name: "Peso" }));
  expect(await screen.findByText("martes 20 de octubre")).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("tab", { name: "Tutores" }));
  expect(await screen.findByText("Luis Torres")).toBeOnTheScreen();
  expect(screen.getByText("Responsable autorizado")).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("tab", { name: "Citas" }));
  expect(await screen.findByRole("button", { name: "Solicitar cita para Luna" })).toBeOnTheScreen();
});
