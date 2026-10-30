import { fireEvent, screen } from "expo-router/testing-library";

import { problem } from "@/test/fake-api";
import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("muestra el mensaje de la API si las credenciales fallan", async () => {
  await renderApp({
    "POST /api/v1/auth/login": () =>
      problem(401, "not_authenticated", "Correo o contraseña incorrectos."),
  });

  fireEvent.changeText(await screen.findByLabelText("Correo"), "ana@example.test");
  fireEvent.changeText(screen.getByLabelText("Contraseña"), "equivocada");
  fireEvent.press(screen.getByRole("button", { name: "Ingresar" }));

  expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeOnTheScreen();
});
