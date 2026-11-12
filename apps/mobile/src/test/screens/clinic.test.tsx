import * as SecureStore from "expo-secure-store";
import { fireEvent, screen } from "expo-router/testing-library";

import { json } from "@/test/fake-api";
import { calendario, consulta, luna, NOW, REFRESH_KEY, signedIn } from "@/test/fixtures";
import { cleanupTimers, goTo, renderApp } from "@/test/render-app";

afterEach(cleanupTimers);

it("muestra el horario de la sede y los servicios, y pide uno directamente", async () => {
  await SecureStore.setItemAsync(REFRESH_KEY, "refresh-guardado");
  await renderApp(
    {
      ...signedIn,
      "GET /api/v1/me/pets": () => json([luna]),
      "GET /api/v1/me/appointments": () => json([]),
      "GET /api/v1/clinic/calendar": () => json(calendario),
      "GET /api/v1/clinic/service-types": () =>
        json([
          { ...consulta, description: "Revisión completa y vacunas al día." },
          {
            ...consulta,
            id: "corte",
            name: "Baño y corte",
            category: "grooming",
            duration_minutes: 90,
            bookable_by_client: false,
          },
          { ...consulta, id: "antiguo", name: "Servicio retirado", active: false },
        ]),
      "GET /api/v1/scheduling/availability": () => json([]),
    },
    "/",
    { now: NOW },
  );
  await goTo("/clinica");

  // Jueves 12 a las 09:00 en Lima: abierto. Solo se listan los feriados que vienen.
  expect(await screen.findByText("Abierto ahora")).toBeOnTheScreen();
  expect(screen.getByLabelText("Jueves: 09:00 a 18:00")).toBeOnTheScreen();
  expect(screen.getByLabelText("Sábado: 09:00 a 13:00")).toBeOnTheScreen();
  expect(screen.getByLabelText("Domingo: cerrado")).toBeOnTheScreen();
  expect(screen.getByText("8 de diciembre de 2026 · Inmaculada Concepción")).toBeOnTheScreen();
  expect(screen.queryByText(/Año Nuevo/)).not.toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("tab", { name: "Servicios" }));
  expect(await screen.findByText("Consultas")).toBeOnTheScreen();
  expect(screen.getByText("1 h 30 min")).toBeOnTheScreen();
  expect(screen.queryByText("Servicio retirado")).not.toBeOnTheScreen();

  // Un servicio que no se reserva desde la app lo explica.
  await fireEvent.press(screen.getByRole("button", { name: "Baño y corte" }));
  expect(await screen.findByText(/Se agenda en la veterinaria/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("button", { name: "Consulta general" }));
  expect(await screen.findByText("Revisión completa y vacunas al día.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Solicitar este servicio" }));

  expect(await screen.findByRole("header", { name: "Solicitar una cita" })).toBeOnTheScreen();
  expect(await screen.findByRole("radio", { name: "Consulta general" })).toBeChecked();
});
