import { defineConfig, devices } from "@playwright/test";

/**
 * Recorridos de extremo a extremo contra la API real (docs/testing/README.md).
 *
 * Requieren la API levantada con datos base: `bash scripts/e2e-bootstrap.sh` desde la raíz deja
 * migraciones, la sede ficticia y un administrador con las credenciales de `E2E_ADMIN_*`.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  // Los recorridos comparten la agenda de la sede: en serie no compiten por los horarios.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    locale: "es-PE",
    // A propósito lejos de Lima: la agenda debe mostrar la hora de la sede, no la del navegador.
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
