import * as SecureStore from "expo-secure-store";
import { fireEvent, screen } from "expo-router/testing-library";

import { empty, json, staff, tokens } from "@/test/fake-api";
import { cleanupTimers, REFRESH_KEY, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("una cuenta del personal no puede usar la app", async () => {
  await renderApp({
    "POST /api/v1/auth/login": () => tokens(),
    "GET /api/v1/auth/me": () => json(staff()),
    "POST /api/v1/auth/logout": () => empty(),
  });

  fireEvent.changeText(await screen.findByLabelText("Correo"), "recepcion@example.test");
  fireEvent.changeText(screen.getByLabelText("Contraseña"), "una frase larga");
  fireEvent.press(screen.getByRole("button", { name: "Ingresar" }));

  expect(
    await screen.findByText(/El personal ingresa por la web de administración/),
  ).toBeOnTheScreen();
  expect(await SecureStore.getItemAsync(REFRESH_KEY)).toBeNull();
});
