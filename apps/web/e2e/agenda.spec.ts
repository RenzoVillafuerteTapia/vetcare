import { expect, test, type APIRequestContext } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8000";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

/** Datos ficticios y únicos por ejecución, para no chocar con corridas anteriores. */
const run = Date.now().toString().slice(-8);
const client = {
  full_name: `Cliente E2E ${run}`,
  document_type: "dni",
  document_number: run,
  phone: "987654321",
};
const petName = `Firulais ${run}`;

async function seedClientWithPet(request: APIRequestContext) {
  const login = await request.post(`${API}/api/v1/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, client: "mobile" },
  });
  expect(login.ok(), "inicio de sesión del administrador de pruebas").toBeTruthy();
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };

  const created = await request.post(`${API}/api/v1/clients`, { data: client, headers });
  expect(created.status()).toBe(201);
  const pet = await request.post(`${API}/api/v1/clients/${(await created.json()).id}/pets`, {
    data: { name: petName, species: "dog", sex: "male", birth_date_approximate: false },
    headers,
  });
  expect(pet.status()).toBe(201);
}

/** Próximos días (`AAAA-MM-DD`) en la sede, desde mañana. */
function upcomingDays(count: number): string[] {
  const lima = Date.now() - 5 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, index) =>
    new Date(lima + (index + 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

test.beforeAll(async ({ request }) => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Define E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD (ver scripts/e2e-bootstrap.sh).",
  );
  await seedClientWithPet(request);
});

test("recepción agenda una cita, la ve en el calendario y la cancela", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await page.getByRole("link", { name: "Agenda" }).first().click();
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();

  // --- Agendar ---
  await page.getByRole("button", { name: "Nueva cita" }).click();
  const booking = page.getByRole("dialog", { name: "Nueva cita" });
  await booking.getByLabel("Cliente").fill(client.document_number);
  await booking.getByRole("button", { name: new RegExp(client.full_name) }).click();
  await booking.getByLabel("Mascota").selectOption({ label: petName });
  await booking.getByLabel("Servicio").selectOption({ label: "Consulta general · 30 min" });

  // El primer día con horarios libres (la sede no atiende todos los días).
  const time = booking.getByLabel("Hora");
  let slot = "";
  for (const day of upcomingDays(10)) {
    const answered = page.waitForResponse(
      (response) => response.url().includes("/scheduling/availability") && response.ok(),
    );
    await booking.getByLabel("Día").fill(day);
    await answered;
    const options = time.locator("option:not([value=''])");
    if ((await options.count()) > 0) {
      slot = (await options.first().textContent()) ?? "";
      await time.selectOption({ index: 1 });
      break;
    }
  }
  expect(slot, "algún día con horarios libres").not.toBe("");

  await booking.getByLabel("Motivo (opcional)").fill("Recorrido E2E");
  await booking.getByRole("button", { name: "Agendar cita" }).click();

  await expect(booking).toBeHidden();
  const confirmation = page.getByRole("alert").filter({ hasText: `Cita agendada para ${petName}` });
  // La hora es la de la sede aunque el navegador esté en otra zona horaria.
  await expect(confirmation).toContainText(slot);

  // --- Ver en el calendario (ya navegó a la semana de la cita) y abrir el detalle ---
  const event = page.locator(".agenda-calendar").getByText(`${petName} · Consulta general`);
  await expect(event).toBeVisible();
  await event.click();
  const detail = page.getByRole("dialog", { name: `${petName} · Consulta general` });
  await expect(detail.getByText("Confirmada")).toBeVisible();
  await expect(detail.getByText(slot)).toBeVisible();
  await expect(detail.getByText("Recorrido E2E")).toBeVisible();

  // --- Una transición que la API rechaza se explica al usuario ---
  await detail.getByRole("button", { name: "No asistió" }).click();
  await expect(detail.getByRole("alert")).toContainText(
    "La inasistencia se registra después de la hora de la cita.",
  );

  // --- Cancelar ---
  await detail.getByRole("button", { name: "Cancelar cita" }).click();
  await detail.getByLabel("Motivo de la cancelación (opcional)").fill("Fin del recorrido");
  await detail.getByRole("button", { name: "Cancelar la cita" }).click();
  await expect(detail.locator("dl").getByText("Cancelada", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Ya no ocupa la agenda; vuelve a verse si se piden las canceladas.
  await expect(event).toBeHidden();
  await page.getByLabel("Mostrar canceladas e inasistencias").check();
  await expect(event).toBeVisible();
});
