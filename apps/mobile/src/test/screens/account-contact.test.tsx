import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { json, problem } from "@/test/fake-api";
import { NOW, perfil, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("el cliente corrige su teléfono y dirección", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let rejected = true;
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([]),
      "GET /api/v1/me/appointments": () => json([]),
      "GET /api/v1/me/profile": () => json(perfil),
      "PUT /api/v1/me/profile": async (request) => {
        if (rejected) {
          return problem(422, "validation_failed", "Datos inválidos", [
            { field: "phone", message: "Usa un número de teléfono válido." },
          ]);
        }
        const body = (await request.json()) as { phone: string; address: string };
        return json({ ...perfil, ...body });
      },
    },
    "/",
    { now: NOW },
  );
  await goTo("/cuenta/datos");

  // El nombre, el documento y el correo se ven, pero no se editan aquí.
  expect(await screen.findByText("Ana Pérez")).toBeOnTheScreen();
  expect(screen.getByText("DNI")).toBeOnTheScreen();
  expect(screen.getByText("12345678")).toBeOnTheScreen();
  expect(screen.getByText("ana@example.test")).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText("Teléfono"), "123");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Usa un número de teléfono válido.")).toBeOnTheScreen();

  rejected = false;
  await fireEvent.changeText(screen.getByLabelText("Teléfono"), "+51999888777");
  await fireEvent.changeText(screen.getByLabelText("Dirección (opcional)"), "Av. Larco 123");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));

  expect(await screen.findByText("Guardamos tus datos.")).toBeOnTheScreen();
  await waitFor(() => expect(api.calls("PUT /api/v1/me/profile")).toHaveLength(2));
  expect(await api.calls("PUT /api/v1/me/profile")[1]?.json()).toEqual({
    phone: "+51999888777",
    address: "Av. Larco 123",
  });
});
