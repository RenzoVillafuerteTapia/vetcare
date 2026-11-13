import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { act, fireEvent, screen } from "expo-router/testing-library";

import { empty, json } from "@/test/fake-api";
import { REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("registra el teléfono para los avisos y lo da de baja al cerrar sesión", async () => {
  // Con el proyecto de EAS configurado (en desarrollo no lo está y no se pide permiso).
  // `expoConfig` es un getter no configurable; Jest aísla este módulo por archivo.
  Constants.expoConfig!.extra = { eas: { projectId: "proyecto-de-prueba" } };
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  const { api } = await renderApp({
    ...signedIn,
    "GET /api/v1/me/pets": () => json([]),
    "GET /api/v1/me/appointments": () => json([]),
    "PUT /api/v1/me/devices": () => empty(),
    "POST /api/v1/me/devices/unregister": () => empty(),
    "POST /api/v1/auth/logout": () => empty(),
  });

  expect(await screen.findByRole("header", { name: "Hola, Ana" })).toBeOnTheScreen();
  await act(async () => {});
  const [registro] = api.calls("PUT /api/v1/me/devices");
  expect(await registro?.json()).toEqual({
    token: "ExponentPushToken[telefono-de-prueba]",
    platform: "ios",
  });

  await fireEvent.press(screen.getByRole("button", { name: "Sesión de Ana Pérez" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("header", { name: "Iniciar sesión" })).toBeOnTheScreen();

  // La baja va antes del logout, mientras el access token todavía sirve.
  const orden = api.requests
    .map((r) => `${r.method} ${new URL(r.url).pathname}`)
    .filter((k) => k.includes("devices/unregister") || k.includes("auth/logout"));
  expect(orden).toEqual(["POST /api/v1/me/devices/unregister", "POST /api/v1/auth/logout"]);
  expect(await api.calls("POST /api/v1/me/devices/unregister")[0]?.json()).toEqual({
    token: "ExponentPushToken[telefono-de-prueba]",
  });
});
