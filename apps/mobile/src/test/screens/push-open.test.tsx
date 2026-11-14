import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { screen } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { cita, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

const state = (Notifications as unknown as { __state: { lastResponse: unknown } }).__state;

function aviso(data: Record<string, string>) {
  return {
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    notification: {
      date: NOW.getTime(),
      request: { identifier: "aviso-1", content: { title: "Cita confirmada", data } },
    },
  };
}

it("al abrir la app desde el aviso, muestra la cita", async () => {
  state.lastResponse = aviso({ url: `/citas/${cita.id}`, appointment_id: cita.id });
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([{ ...cita, status: "confirmed" }]),
      [`GET /api/v1/appointments/${cita.id}`]: () => json({ ...cita, status: "confirmed" }),
    },
    "/",
    { now: NOW },
  );

  expect(await screen.findByText("Confirmada")).toBeOnTheScreen();
  expect(api.calls(`GET /api/v1/appointments/${cita.id}`).length).toBeGreaterThan(0);
  expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
});
