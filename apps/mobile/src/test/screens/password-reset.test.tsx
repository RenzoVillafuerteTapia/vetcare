import { fireEvent, screen } from "expo-router/testing-library";

import { empty } from "@/test/fake-api";
import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("solicita el enlace de recuperación con respuesta genérica", async () => {
  const { api } = await renderApp({ "POST /api/v1/auth/password-reset": () => empty(202) });
  // La respuesta 202 sin cuerpo solo se resuelve con temporizadores reales en el entorno de Jest.
  jest.useRealTimers();

  fireEvent.press(await screen.findByText("¿Olvidaste tu contraseña?"));
  await screen.findByRole("header", { name: "Recuperar contraseña" });
  fireEvent.changeText(screen.getByLabelText("Correo"), "ana@example.test");
  fireEvent.press(screen.getByRole("button", { name: "Enviar enlace" }));

  expect(await screen.findByText(/Si el correo pertenece a una cuenta activa/)).toBeOnTheScreen();
  expect(await api.calls("POST /api/v1/auth/password-reset")[0]?.json()).toEqual({
    email: "ana@example.test",
  });
});
