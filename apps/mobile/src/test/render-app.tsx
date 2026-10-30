import { act, renderRouter } from "expo-router/testing-library";

import { createFakeApi } from "./fake-api";

/**
 * Monta la app con sus rutas reales (`app/`) y la API simulada en `fetch`.
 *
 * Expo Router conserva estado global entre montajes dentro de un mismo archivo de pruebas, así
 * que cada escenario de pantallas vive en su propio archivo (Jest aísla los módulos por archivo).
 * renderRouter activa temporizadores falsos de Jest.
 */
export async function renderApp(handlers: Parameters<typeof createFakeApi>[0], initialUrl = "/") {
  const api = createFakeApi(handlers);
  global.fetch = api.fetch as typeof fetch;
  const result = await renderRouter("./app", { initialUrl });
  return { ...result, api };
}

/** Vacía los temporizadores falsos pendientes y deja los reales para la siguiente prueba. */
export async function cleanupTimers() {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
}

export const REFRESH_KEY = "vetcare.refresh_token";
