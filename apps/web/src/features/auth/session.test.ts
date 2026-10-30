import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";
import { createFakeApi, empty, problem, tokens, user } from "@/test/fake-api";

import { SessionManager } from "./session";

const managers: SessionManager[] = [];
function manager(fetch: (request: Request) => Promise<Response>) {
  const created = new SessionManager("http://api.test", fetch);
  managers.push(created);
  return created;
}

afterEach(() => {
  managers.splice(0).forEach((m) => m.dispose());
});

describe("SessionManager", () => {
  it("recupera la sesión con la cookie y envía el access token a la API", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => tokens("access-cookie"),
      "GET /api/v1/auth/me": () => Response.json(user()),
    });
    const session = manager(api.fetch);

    await session.restore();

    expect(session.getSnapshot()).toEqual({ status: "authenticated", user: user() });
    expect(api.calls("POST /api/v1/auth/refresh")[0]?.credentials).toBe("include");
    expect(api.calls("GET /api/v1/auth/me")[0]?.headers.get("Authorization")).toBe(
      "Bearer access-cookie",
    );
  });

  it("queda anónima si no hay sesión que recuperar", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => problem(401, "not_authenticated"),
    });
    const session = manager(api.fetch);

    await session.restore();

    expect(session.getSnapshot()).toEqual({ status: "anonymous" });
  });

  it("comparte una sola renovación entre llamadas simultáneas", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": async () => {
        await gate;
        return tokens();
      },
      "GET /api/v1/auth/me": () => Response.json(user()),
    });
    const session = manager(api.fetch);

    const results = Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    release();

    expect(await results).toEqual([true, true, true]);
    expect(api.calls("POST /api/v1/auth/refresh")).toHaveLength(1);
  });

  it("inicia sesión como cliente web y notifica a los suscriptores", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/login": () => tokens(),
      "GET /api/v1/auth/me": () => Response.json(user()),
    });
    const session = manager(api.fetch);
    const listener = vi.fn();
    session.subscribe(listener);

    await session.login("ana@example.test", "una frase larga");

    expect(await api.calls("POST /api/v1/auth/login")[0]?.json()).toEqual({
      email: "ana@example.test",
      password: "una frase larga",
      client: "web",
    });
    expect(session.getSnapshot().status).toBe("authenticated");
    expect(listener).toHaveBeenCalled();
  });

  it("lanza el error de la API si las credenciales no son válidas", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/login": () =>
        problem(401, "not_authenticated", "Correo o contraseña incorrectos."),
    });
    const session = manager(api.fetch);

    await expect(session.login("ana@example.test", "x")).rejects.toMatchObject({
      message: "Correo o contraseña incorrectos.",
    });
    await expect(session.login("ana@example.test", "x")).rejects.toBeInstanceOf(ApiError);
  });

  it("termina la sesión como vencida si un 401 no se puede renovar", async () => {
    let refreshOk = true;
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => (refreshOk ? tokens() : problem(401, "not_authenticated")),
      "GET /api/v1/auth/me": () => Response.json(user()),
    });
    const session = manager(api.fetch);
    await session.restore();
    refreshOk = false;

    expect(await session.handleUnauthorized()).toBe(false);
    expect(session.getSnapshot()).toEqual({ status: "anonymous", reason: "expired" });
  });

  it("cierra la sesión localmente aunque la API no responda", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => tokens(),
      "GET /api/v1/auth/me": () => Response.json(user()),
      "POST /api/v1/auth/logout": () => {
        throw new TypeError("sin red");
      },
    });
    const session = manager(api.fetch);
    await session.restore();

    await session.logout().catch(() => undefined);

    expect(session.getSnapshot()).toEqual({ status: "anonymous", reason: "logged_out" });
  });

  it("programa la renovación un minuto antes de que venza el access token", async () => {
    vi.useFakeTimers();
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => tokens(),
      "GET /api/v1/auth/me": () => Response.json(user()),
      "POST /api/v1/auth/logout": () => empty(),
    });
    const session = manager(api.fetch);
    await session.restore();
    expect(api.calls("POST /api/v1/auth/refresh")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(839_000);
    expect(api.calls("POST /api/v1/auth/refresh")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(api.calls("POST /api/v1/auth/refresh")).toHaveLength(2);
    vi.useRealTimers();
  });
});

describe("SessionManager: solo personal", () => {
  it("rechaza una cuenta de cliente y revoca la sesión que abrió", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/login": () => tokens(),
      "GET /api/v1/auth/me": () =>
        Response.json(user({ roles: ["client"], permissions: ["own:pets:read"] })),
      "POST /api/v1/auth/logout": () => empty(),
    });
    const session = manager(api.fetch);

    await expect(session.login("cliente@example.test", "x")).rejects.toMatchObject({
      message: expect.stringContaining("Los dueños de mascotas usan la app móvil"),
    });
    expect(api.calls("POST /api/v1/auth/logout")).toHaveLength(1);
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("no recupera la sesión de una cuenta de cliente al recargar", async () => {
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => tokens(),
      "GET /api/v1/auth/me": () =>
        Response.json(user({ roles: ["client"], permissions: ["own:pets:read"] })),
      "POST /api/v1/auth/logout": () => empty(),
    });
    const session = manager(api.fetch);

    await session.restore();

    expect(session.getSnapshot().status).toBe("anonymous");
  });
});
