import * as SecureStore from "expo-secure-store";
import { act, fireEvent, screen } from "expo-router/testing-library";

import type { TrackedService } from "@/lib/labels";
import { TRACKING_REFRESH_MS } from "@/lib/query-client";
import { json } from "@/test/fake-api";
import { cita, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

const LABELS = ["Recibido", "Baño", "Secado", "Corte y peinado", "Listo para recoger"];

function bano(current: number, extra: Partial<TrackedService> = {}): TrackedService {
  const last = current === LABELS.length - 1;
  return {
    id: "0192f0a4-0000-7000-8000-0000000000a1",
    appointment_id: cita.id,
    pet_id: luna.id,
    pet_name: "Luna",
    service_name: "Baño",
    template: "grooming",
    status: last ? "ready" : "in_progress",
    stages: LABELS.map((label, i) => ({
      code: `etapa-${i}`,
      label,
      state: i < current ? "done" : i === current ? "current" : "pending",
      reached_at: i <= current ? `2026-11-12T14:${String(i * 10).padStart(2, "0")}:00Z` : null,
    })),
    current_stage: `etapa-${current}`,
    next_stage: last ? null : (LABELS[current + 1] ?? null),
    next_is_discharge: false,
    updates: [
      {
        id: "0192f0a4-0000-7000-8000-0000000000a9",
        at: NOW.toISOString(),
        text: "Se portó muy bien.",
      },
    ],
    updates_hidden: false,
    started_at: "2026-11-12T14:00:00Z",
    updated_at: NOW.toISOString(),
    handed_over_at: null,
    ...extra,
  };
}

it("muestra el baño en curso y se actualiza solo hasta que está lista", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let current = 1;
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([]),
      "GET /api/v1/me/tracked-services": () => json([bano(current)]),
      [`GET /api/v1/tracked-services/${bano(0).id}`]: () => json(bano(current)),
    },
    "/",
    { now: NOW },
  );

  // Inicio: la tarjeta en vivo reemplaza la nota de "próximamente".
  expect(await screen.findByText("En curso ahora")).toBeOnTheScreen();
  expect(screen.getByText("Luna · Baño")).toBeOnTheScreen();
  expect(screen.queryByText(/aquí verás su avance en vivo/)).not.toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Luna, Baño: Baño" }));
  expect(await screen.findByText("Ahora: Baño")).toBeOnTheScreen();
  expect(screen.getByText("Sigue: Secado")).toBeOnTheScreen();
  expect(screen.getByLabelText("Recibido: hecho, 09:00")).toBeOnTheScreen();
  expect(screen.getByLabelText("Secado: pendiente")).toBeOnTheScreen();
  expect(screen.getByText("Se portó muy bien.")).toBeOnTheScreen();
  expect(screen.getByText("En vivo")).toBeOnTheScreen();

  // La groomer termina; sin tocar el teléfono, la pantalla lo muestra.
  const before = api.calls(`GET /api/v1/tracked-services/${bano(0).id}`).length;
  current = 4;
  await act(async () => {
    jest.advanceTimersByTime(TRACKING_REFRESH_MS);
  });
  expect(await screen.findByText("Luna está lista para recoger.")).toBeOnTheScreen();
  expect(screen.getByText("Finalizado")).toBeOnTheScreen();
  expect(api.calls(`GET /api/v1/tracked-services/${bano(0).id}`).length).toBeGreaterThan(before);
});
