import * as SecureStore from "expo-secure-store";
import { fireEvent, screen } from "expo-router/testing-library";

import { json, problem } from "@/test/fake-api";
import { cita, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("cancela una cita con un motivo y muestra el rechazo de la API", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let current = cita;
  let rejected = true;
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([current]),
      [`GET /api/v1/appointments/${cita.id}`]: () => json(current),
      [`POST /api/v1/appointments/${cita.id}/cancel`]: () => {
        if (rejected) {
          rejected = false;
          return problem(403, "permission_denied", "Tu tutela no permite gestionar citas.");
        }
        return json((current = { ...cita, status: "cancelled", cancellation_reason: "Viajamos" }));
      },
    },
    "/",
    { now: NOW },
  );
  await goTo(`/citas/${cita.id}`);

  expect(await screen.findByText("Control anual")).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Cancelar cita" }));
  await fireEvent.changeText(await screen.findByLabelText("Motivo (opcional)"), "Viajamos");
  await fireEvent.press(screen.getByRole("button", { name: "Sí, cancelar la cita" }));

  // La API tiene la última palabra: su motivo se muestra tal cual.
  expect(await screen.findByText("Tu tutela no permite gestionar citas.")).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Sí, cancelar la cita" }));
  expect(await screen.findByText("Cancelaste la cita.")).toBeOnTheScreen();
  expect(screen.getByText("Cancelada")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Reprogramar" })).not.toBeOnTheScreen();
  expect(await api.calls(`POST /api/v1/appointments/${cita.id}/cancel`)[1]?.json()).toEqual({
    reason: "Viajamos",
  });
});
