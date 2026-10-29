import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { empty, json, tokens, user } from "@/test/fake-api";
import { cleanupTimers, REFRESH_KEY, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("recupera la sesión guardada al abrir la app y permite cerrarla", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  const { api } = await renderApp({
    "POST /api/v1/auth/refresh": () => tokens("access-2", "refresh-rotado"),
    "GET /api/v1/auth/me": () => json(user()),
    "POST /api/v1/auth/logout": () => empty(),
  });

  expect(await screen.findByRole("header", { name: "Hola, Ana" })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));

  expect(await screen.findByRole("header", { name: "Iniciar sesión" })).toBeOnTheScreen();
  expect(await api.calls("POST /api/v1/auth/logout")[0]?.json()).toEqual({
    refresh_token: "refresh-rotado",
  });
  await waitFor(async () => expect(await SecureStore.getItemAsync(REFRESH_KEY)).toBeNull());
});
