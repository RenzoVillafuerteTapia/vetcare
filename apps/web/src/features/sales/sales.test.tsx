import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createFakeApi, json, tokens, user } from "@/test/fake-api";
import { renderApp } from "@/test/render";

import type { Charge, Product, Summary } from "./labels";

const DUENA = user({
  full_name: "Carmen Dueña",
  roles: ["admin"],
  permissions: [
    "appointments:read",
    "tracking:read",
    "inventory:read",
    "inventory:manage",
    "charges:manage",
    "reports:read",
  ],
});

function signedIn(currentUser = DUENA) {
  return {
    "POST /api/v1/auth/refresh": () => tokens(),
    "GET /api/v1/auth/me": () => json(currentUser),
  };
}

const antipulgas: Product = {
  id: "0192f0a4-0000-7000-8000-0000000000p1",
  name: "Antipulgas en tabletas",
  sku: null,
  category: "medicine",
  unit: "tableta",
  cost_price: "22.00",
  sale_price: "35.00",
  stock: "2.00",
  min_stock: "3.00",
  low_stock: true,
  active: true,
};

const resumen: Summary = {
  revenue: "120.00",
  product_cost: "44.00",
  profit: "76.00",
  count: 1,
  voided: 0,
  by_method: [{ method: "yape", total: "120.00" }],
  by_kind: [],
  by_day: [],
  top_products: [],
};

const cobro: Charge = {
  id: "0192f0a4-0000-7000-8000-0000000000c1",
  at: "2026-11-13T15:00:00Z",
  method: "yape",
  status: "registered",
  total: "120.00",
  lines: [],
  customer_name: "Ana Pérez",
  pet_name: "Luna",
  notes: null,
  void_reason: null,
};

describe("Ventas", () => {
  it("el inicio muestra los indicadores del día según los permisos", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/appointments": () => json([]),
      "GET /api/v1/tracked-services": () => json([]),
      "GET /api/v1/sales/summary": () => json(resumen),
      "GET /api/v1/sales/products": () => json([antipulgas]),
    });
    renderApp("/", api.fetch);

    const indicadores = await screen.findByRole("region", { name: "Indicadores del día" });
    expect(within(indicadores).getByText("Citas de hoy")).toBeVisible();
    expect(await within(indicadores).findByText("S/ 120.00")).toBeVisible();
    expect(within(indicadores).getByText("Ganancia S/ 76.00")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Productos por reponer" })).toBeVisible();
    expect(screen.queryByText(/Fase 1/)).not.toBeInTheDocument();
  });

  it("el inventario marca el stock bajo y crea productos", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/sales/products": () => json([antipulgas]),
      "POST /api/v1/sales/products": () => json({ ...antipulgas, id: "nuevo" }, 201),
    });
    renderApp("/inventario", api.fetch);

    expect(await screen.findByText("Antipulgas en tabletas")).toBeVisible();
    expect(screen.getByText("Stock bajo", { selector: "span" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Shampoo hipoalergénico");
    await userEvent.type(screen.getByLabelText("Costo (S/)"), "18");
    await userEvent.type(screen.getByLabelText("Precio de venta (S/)"), "30");
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));

    await waitFor(() => expect(api.calls("POST /api/v1/sales/products")).toHaveLength(1));
    const [envio] = api.calls("POST /api/v1/sales/products");
    expect(await envio?.json()).toMatchObject({
      name: "Shampoo hipoalergénico",
      category: "medicine",
      cost_price: "18",
      sale_price: "30",
    });
  });

  it("registra un cobro con un servicio y un producto y muestra la ganancia", async () => {
    const api = createFakeApi({
      ...signedIn(),
      "GET /api/v1/sales/charges": () => json([cobro]),
      "GET /api/v1/sales/summary": () => json(resumen),
      "GET /api/v1/sales/products": () => json([{ ...antipulgas, stock: "10.00" }]),
      "GET /api/v1/clinic/service-types": () =>
        json([
          {
            id: "0192f0a4-0000-7000-8000-0000000000s1",
            code: "consulta",
            name: "Consulta general",
            category: "consultation",
            duration_minutes: 30,
            required_resources: ["veterinarian"],
            bookable_by_client: true,
            description: "",
            active: true,
          },
        ]),
      "POST /api/v1/sales/charges": () => json(cobro, 201),
    });
    renderApp("/cobros", api.fetch);

    expect(await screen.findByText("S/ 76.00")).toBeVisible();
    expect(screen.getByText("Margen 63%")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    await userEvent.click(screen.getByRole("button", { name: "Servicio" }));
    await userEvent.selectOptions(await screen.findByLabelText("Servicio"), "Consulta general");
    await userEvent.type(screen.getAllByLabelText("Precio (S/)")[0]!, "50");
    await userEvent.click(screen.getByRole("button", { name: "Producto" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Producto"),
      "Antipulgas en tabletas (10 tableta)",
    );
    const cantidades = screen.getAllByLabelText("Cantidad");
    await userEvent.clear(cantidades[1]!);
    await userEvent.type(cantidades[1]!, "2");
    await userEvent.selectOptions(screen.getByLabelText("Medio de pago"), "Yape");

    expect(screen.getByText("S/ 120.00", { selector: "strong" })).toBeVisible();
    const dialogo = screen.getByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Registrar cobro" }));

    await waitFor(() => expect(api.calls("POST /api/v1/sales/charges")).toHaveLength(1));
    const [envio] = api.calls("POST /api/v1/sales/charges");
    expect(await envio?.json()).toMatchObject({
      method: "yape",
      lines: [
        { kind: "service", quantity: "1", unit_price: "50", description: "Consulta general" },
        { kind: "product", quantity: "2", unit_price: "35.00", product_id: antipulgas.id },
      ],
    });
  });
});
