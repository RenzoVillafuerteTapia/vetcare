import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createFakeApi, json, problem, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

import type { TrackedService } from "./tracking-page";

const ASISTENTE = user({
  full_name: "Carla Asistente",
  roles: ["assistant"],
  permissions: [
    "pets:read",
    "appointments:read",
    "tracking:read",
    "tracking:advance",
    "tracking:publish_update",
    "tracking:hand_over",
  ],
});

function signedIn(currentUser = ASISTENTE) {
  return {
    "POST /api/v1/auth/refresh": () => tokens(),
    "GET /api/v1/auth/me": () => json(currentUser),
  };
}

const LABELS = ["Ingreso", "Preparación", "En cirugía", "Recuperación", "Alta autorizada"];

function cirugia(current: number): TrackedService {
  return {
    id: "0192f0a4-0000-7000-8000-0000000000a1",
    appointment_id: "0192f0a4-0000-7000-8000-0000000000d1",
    pet_id: "0192f0a4-0000-7000-8000-00000000e001",
    pet_name: "Luna",
    service_name: "Esterilización",
    template: "surgery",
    status: current === 4 ? "ready" : "in_progress",
    stages: LABELS.map((label, i) => ({
      code: `etapa-${i}`,
      label,
      state: i < current ? "done" : i === current ? "current" : "pending",
      reached_at: i <= current ? "2026-11-12T14:00:00Z" : null,
    })),
    current_stage: `etapa-${current}`,
    next_stage: LABELS[current + 1] ?? null,
    next_is_discharge: current === 3,
    updates: [],
    updates_hidden: false,
    started_at: "2026-11-12T14:00:00Z",
    updated_at: "2026-11-12T14:00:00Z",
    handed_over_at: null,
  };
}

describe("Seguimiento", () => {
  it("avanza etapas, publica avances y deja el alta al veterinario", async () => {
    let current = 2;
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/tracked-services": () => json([cirugia(current)]),
      [`POST /api/v1/tracked-services/${cirugia(0).id}/advance`]: () => {
        current += 1;
        return json(cirugia(current));
      },
      [`POST /api/v1/tracked-services/${cirugia(0).id}/updates`]: () => json(cirugia(current)),
    });
    renderApp("/seguimiento", api.fetch);

    expect(await screen.findByRole("heading", { name: "Luna · Esterilización" })).toBeVisible();
    const etapas = screen.getByRole("list", { name: "Etapas" });
    expect(within(etapas).getByText("En cirugía").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );

    await userEvent.click(screen.getByRole("button", { name: "Pasar a Recuperación" }));
    await waitFor(() =>
      expect(api.calls(`POST /api/v1/tracked-services/${cirugia(0).id}/advance`)).toHaveLength(1),
    );
    const [envio] = api.calls(`POST /api/v1/tracked-services/${cirugia(0).id}/advance`);
    expect(await envio?.json()).toEqual({ from_stage: "etapa-2" });

    // El siguiente paso es el alta: la asistente no la autoriza.
    expect(await screen.findByText("El alta la autoriza un veterinario.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Autorizar el alta" })).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("Avance para el dueño"),
      "Luna ya despertó y está tranquila.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() =>
      expect(api.calls(`POST /api/v1/tracked-services/${cirugia(0).id}/updates`)).toHaveLength(1),
    );
    const [avance] = api.calls(`POST /api/v1/tracked-services/${cirugia(0).id}/updates`);
    expect(await avance?.json()).toEqual({ text: "Luna ya despertó y está tranquila." });
  });

  it("muestra el error de la API si la etapa ya cambió", async () => {
    const api = createFakeApi({
      ...signedIn(
        user({
          roles: ["veterinarian"],
          permissions: ["tracking:read", "tracking:advance", "tracking:authorize_discharge"],
        }),
      ),
      "GET /api/v1/tracked-services": () => json([cirugia(3)]),
      [`POST /api/v1/tracked-services/${cirugia(0).id}/advance`]: () =>
        problem(409, "stage_changed", "La etapa ya cambió a «Alta autorizada»."),
    });
    renderApp("/seguimiento", api.fetch);

    await userEvent.click(await screen.findByRole("button", { name: "Autorizar el alta" }));
    expect(await screen.findByText("La etapa ya cambió a «Alta autorizada».")).toBeVisible();
  });
});
