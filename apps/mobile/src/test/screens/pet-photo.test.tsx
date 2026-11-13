import * as SecureStore from "expo-secure-store";
import { fireEvent, screen, waitFor } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { luna, NOW, REFRESH_KEY, signedIn, toby } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

const conFoto = { ...luna, photo_url: "http://api.test/api/v1/files/pets/luna.jpg?sig=x" };
const tobyAjeno = { ...toby, can_change_photo: false };

it("un dueño sube la foto desde la galería y la quita; un autorizado no puede", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  let actual = luna;
  const { api } = await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna, tobyAjeno]),
      "GET /api/v1/me/appointments": () => json([]),
      [`GET /api/v1/pets/${luna.id}`]: () => json(actual),
      [`GET /api/v1/pets/${toby.id}`]: () => json(tobyAjeno),
      [`PUT /api/v1/pets/${luna.id}/photo`]: () => json((actual = conFoto)),
      [`DELETE /api/v1/pets/${luna.id}/photo`]: () => json((actual = luna)),
    },
    "/",
    { now: NOW },
  );
  await goTo(`/mascotas/${luna.id}`);

  await fireEvent.press(await screen.findByRole("button", { name: "Cambiar la foto de Luna" }));
  expect(await screen.findByRole("header", { name: "Foto de Luna" })).toBeOnTheScreen();
  // Sin foto todavía, no se ofrece quitarla.
  expect(screen.queryByRole("button", { name: "Quitar la foto" })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Elegir de la galería" }));

  await waitFor(() => expect(api.calls(`PUT /api/v1/pets/${luna.id}/photo`)).toHaveLength(1));
  const upload = api.calls(`PUT /api/v1/pets/${luna.id}/photo`)[0];
  expect(upload?.headers.get("content-type")).toMatch(/^multipart\/form-data/);
  // El archivo viaja como Blob (el fetch de Expo no acepta el { uri, name, type } clásico).
  // Es el FormData del entorno de Jest (web), no el de React Native: tiene get().
  const form = (await upload?.formData()) as unknown as { get(name: string): unknown };
  const sent = form.get("file");
  expect(sent).toBeInstanceOf(Blob);
  expect((sent as File).name).toBe("luna.jpg");
  expect(await screen.findByLabelText("Foto de Luna")).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Cambiar la foto de Luna" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Quitar la foto" }));
  await waitFor(() => expect(api.calls(`DELETE /api/v1/pets/${luna.id}/photo`)).toHaveLength(1));

  // Toby: Ana solo es responsable autorizada, la foto no se puede tocar.
  await goTo(`/mascotas/${toby.id}`);
  expect(await screen.findByRole("header", { name: "Toby" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Cambiar la foto de Toby" })).not.toBeOnTheScreen();
});
