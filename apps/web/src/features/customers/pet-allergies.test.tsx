import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createFakeApi, json, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

import type { Pet } from "./labels";

const RECEPCION = user({ permissions: ["clients:manage", "pets:read", "pets:manage"] });

const toby: Pet = {
  id: "0192f0a4-0000-7000-8000-00000000e009",
  name: "Toby",
  species: "dog",
  sex: "male",
  breed: "Beagle",
  birth_date: null,
  birth_date_approximate: false,
  color: "Tricolor",
  status: "active",
  allergies: null,
  notes: "Muerde al cortarle las uñas.",
  photo_url: null,
  can_change_photo: false,
  weights: [],
  guardians: [],
};

function api(pet: Pet) {
  let current = pet;
  return createFakeApi({
    "POST /api/v1/auth/refresh": () => tokens(),
    "GET /api/v1/auth/me": () => json(RECEPCION),
    [`GET /api/v1/pets/${pet.id}`]: () => json(current),
    [`PUT /api/v1/pets/${pet.id}`]: async (request) => {
      const body = (await request.json()) as { allergies: string | null };
      current = { ...current, allergies: body.allergies };
      return json(current);
    },
  });
}

describe("alergias en el perfil de la mascota", () => {
  it("se agregan con un toque y se quitan, sin abrir el formulario", async () => {
    const fake = api(toby);
    renderApp(`/mascotas/${toby.id}`, fake.fetch);

    expect(await screen.findByRole("heading", { name: "Sin alergias registradas" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Volver" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "+ Pollo" }));
    expect(await screen.findByRole("heading", { name: "Alergias" })).toBeVisible();

    await userEvent.type(screen.getByLabelText("Agregar alergia"), "Amoxicilina");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Quitar Amoxicilina" })).toBeVisible(),
    );

    const puts = fake.calls(`PUT /api/v1/pets/${toby.id}`);
    expect(await puts[1]?.json()).toMatchObject({
      name: "Toby",
      notes: "Muerde al cortarle las uñas.",
      allergies: "Pollo, Amoxicilina",
    });

    await userEvent.click(screen.getByRole("button", { name: "Quitar Pollo" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Quitar Pollo" })).toBeNull());
  });
});
