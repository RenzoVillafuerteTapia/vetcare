import { fireEvent, screen } from "expo-router/testing-library";

import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("sin sesión muestra el login y valida en español sin llamar a la API", async () => {
  const { api } = await renderApp({});

  expect(await screen.findByRole("header", { name: "Iniciar sesión" })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Ingresar" }));

  expect(await screen.findByText("Ingresa tu correo.")).toBeOnTheScreen();
  expect(screen.getByText("Ingresa tu contraseña.")).toBeOnTheScreen();
  expect(api.calls("POST /api/v1/auth/login")).toHaveLength(0);
});
