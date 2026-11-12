import { router } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";

import { createFakeApi } from "./fake-api";

/**
 * Monta la app con sus rutas reales (`app/`) y la API simulada en `fetch`.
 *
 * Expo Router conserva estado global entre montajes dentro de un mismo archivo de pruebas, así
 * que cada escenario de pantallas vive en su propio archivo (Jest aísla los módulos por archivo).
 * renderRouter activa temporizadores falsos de Jest.
 */
export async function renderApp(
  handlers: Parameters<typeof createFakeApi>[0],
  initialUrl = "/",
  options: { now?: Date } = {},
) {
  const api = createFakeApi(handlers);
  if (options.now) {
    // renderRouter conserva la hora del reloj al activar sus temporizadores falsos.
    jest.useFakeTimers({ now: options.now });
  }
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

let navigated = false;

/**
 * Con la sesión ya abierta en el inicio, navega a otra pantalla. Abrir la app directamente en
 * una ruta protegida antes de recuperar la sesión no está soportado (la app siempre abre en `/`).
 */
export async function goTo(path: string) {
  if (screen.queryByRole("header", { name: /^Hola,/ }) === null && !navigated) {
    await screen.findByRole("header", { name: /^Hola,/ });
  }
  navigated = true;
  await act(async () => {
    router.push(path as never);
  });
}
