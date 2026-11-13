import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createFakeApi, json, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

import type { Pet } from "./labels";

const RECEPCION = user({ permissions: ["clients:manage", "pets:read", "appointments:manage"] });

const luna: Pet = {
  id: "0192f0a4-0000-7000-8000-00000000e001",
  name: "Luna",
  species: "dog",
  sex: "female",
  breed: "Schnauzer",
  birth_date: null,
  birth_date_approximate: false,
  color: null,
  status: "active",
  allergies: "Pollo",
  notes: null,
  photo_url: null,
  can_change_photo: false,
  weights: [],
  guardians: [
    {
      client_id: "0192f0a4-0000-7000-8000-00000000c001",
      full_name: "Rosa Quispe",
      kind: "owner",
      permissions: { can_pickup: true, can_book: true, can_view_clinical: true },
    },
  ],
};
const michi: Pet = {
  ...luna,
  id: "0192f0a4-0000-7000-8000-00000000e002",
  name: "Michi",
  species: "cat",
  sex: "male",
  breed: null,
  allergies: null,
};

describe("Mascotas", () => {
  it("muestra las mascotas como tarjetas y filtra por especie", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => tokens(),
      "GET /api/v1/auth/me": () => json(RECEPCION),
      "GET /api/v1/pets": (request) => {
        const species = new URL(request.url).searchParams.get("species");
        const items = species ? [luna, michi].filter((p) => p.species === species) : [luna, michi];
        return json({ items, total: items.length, page: 1, page_size: 20 });
      },
    });
    renderApp("/mascotas", api.fetch);

    const lista = await screen.findByRole("list", { name: "Mascotas" });
    const tarjetaLuna = within(lista).getByRole("link", { name: /Luna/ });
    expect(tarjetaLuna).toHaveAttribute("href", `/mascotas/${luna.id}`);
    expect(within(tarjetaLuna).getByText("Schnauzer")).toBeVisible();
    expect(within(tarjetaLuna).getByText("Alergias")).toBeVisible();
    expect(within(tarjetaLuna).getByText("Dueño: Rosa Quispe")).toBeVisible();
    expect(screen.getByText("2 mascotas")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Gato" }));
    await waitFor(() => expect(screen.getByText("1 mascota")).toBeVisible());
    expect(screen.queryByRole("link", { name: /Luna/ })).not.toBeInTheDocument();
    expect(
      api.calls("GET /api/v1/pets").map((r) => new URL(r.url).searchParams.get("species")),
    ).toContain("cat");
  });
});
