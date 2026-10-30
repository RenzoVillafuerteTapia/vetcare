import * as SecureStore from "expo-secure-store";
import { fireEvent, screen } from "expo-router/testing-library";

import { json, tokens, user } from "@/test/fake-api";
import { cleanupTimers, REFRESH_KEY, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("al ingresar muestra el inicio y guarda la sesión en SecureStore", async () => {
  await renderApp({
    "POST /api/v1/auth/login": () => tokens("access-1", "refresh-1"),
    "GET /api/v1/auth/me": () => json(user()),
  });

  fireEvent.changeText(await screen.findByLabelText("Correo"), "ana@example.test");
  fireEvent.changeText(screen.getByLabelText("Contraseña"), "una frase larga");
  fireEvent.press(screen.getByRole("button", { name: "Ingresar" }));

  expect(await screen.findByRole("header", { name: "Hola, Ana" })).toBeOnTheScreen();
  expect(screen.getByText("Pronto aparecerán aquí")).toBeOnTheScreen();
  expect(await SecureStore.getItemAsync(REFRESH_KEY)).toBe("refresh-1");
});
