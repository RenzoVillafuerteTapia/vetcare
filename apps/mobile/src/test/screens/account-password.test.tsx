import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { json, problem, tokens } from "@/test/fake-api";
import { NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

const NUEVA = "el perro ladra a la luna";

it("cambia la contraseña y guarda la sesión nueva", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let wrongCurrent = true;
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([]),
      "GET /api/v1/me/appointments": () => json([]),
      "POST /api/v1/auth/password": () =>
        wrongCurrent
          ? problem(422, "validation_failed", "La contraseña actual no es correcta.", [
              { field: "current_password", message: "La contraseña actual no es correcta." },
            ])
          : tokens("access-3", "refresh-nuevo"),
    },
    "/",
    { now: NOW },
  );
  await goTo("/cuenta/contrasena");

  await fireEvent.changeText(await screen.findByLabelText("Contraseña actual"), "una que no es");
  await fireEvent.changeText(screen.getByLabelText("Nueva contraseña"), "corta");
  await fireEvent.changeText(screen.getByLabelText("Repite la nueva contraseña"), "otra");
  await fireEvent.press(screen.getByRole("button", { name: "Cambiar contraseña" }));

  // Se valida antes de enviar.
  expect(await screen.findByText("Usa al menos 10 caracteres.")).toBeOnTheScreen();
  expect(screen.getByText("No coincide con la nueva contraseña.")).toBeOnTheScreen();
  expect(api.calls("POST /api/v1/auth/password")).toHaveLength(0);

  await fireEvent.changeText(screen.getByLabelText("Nueva contraseña"), NUEVA);
  await fireEvent.changeText(screen.getByLabelText("Repite la nueva contraseña"), NUEVA);
  await fireEvent.press(screen.getByRole("button", { name: "Cambiar contraseña" }));
  expect(await screen.findByText("La contraseña actual no es correcta.")).toBeOnTheScreen();

  wrongCurrent = false;
  await fireEvent.changeText(screen.getByLabelText("Contraseña actual"), "la de siempre");
  await fireEvent.press(screen.getByRole("button", { name: "Cambiar contraseña" }));

  expect(await screen.findByText("Cambiamos tu contraseña.")).toBeOnTheScreen();
  expect(await api.calls("POST /api/v1/auth/password")[1]?.json()).toEqual({
    current_password: "la de siempre",
    new_password: NUEVA,
    client: "mobile",
  });
  // La API cerró las demás sesiones: este dispositivo guarda la nueva.
  await waitFor(async () =>
    expect(await SecureStore.getItemAsync(REFRESH_KEY)).toBe("refresh-nuevo"),
  );
});
