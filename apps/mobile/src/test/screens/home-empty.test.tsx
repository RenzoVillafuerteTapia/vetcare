import * as SecureStore from "expo-secure-store";
import { screen } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("sin mascotas vinculadas explica qué hacer y no ofrece pedir citas", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([]),
      "GET /api/v1/me/appointments": () => json([]),
    },
    "/",
    { now: NOW },
  );

  expect(await screen.findByText("Todavía no hay mascotas vinculadas")).toBeOnTheScreen();
  expect(
    await screen.findByText("Cuando tengas mascotas vinculadas podrás solicitar citas desde aquí."),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Solicitar una cita" })).not.toBeOnTheScreen();
});
