import { createFakeApi, empty, json, problem, staff, tokens, user } from "@/test/fake-api";

import { SessionManager } from "./session";
import type { TokenStore } from "./token-store";

function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  const store = {
    value: initial,
    get: async () => store.value,
    set: async (token: string) => {
      store.value = token;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

const managers: SessionManager[] = [];
function manager(fetch: (request: Request) => Promise<Response>, store: TokenStore) {
  const created = new SessionManager("http://api.test", store, fetch);
  managers.push(created);
  return created;
}

afterEach(() => {
  managers.splice(0).forEach((m) => m.dispose());
});

describe("SessionManager (móvil)", () => {
  it("sin refresh token guardado queda anónima sin llamar a la API", async () => {
    const api = createFakeApi({});
    const session = manager(api.fetch, memoryStore());

    await session.restore();

    expect(session.getSnapshot()).toEqual({ status: "anonymous" });
    expect(api.requests).toHaveLength(0);
  });

  it("recupera la sesión rotando y guardando el refresh token", async () => {
    const store = memoryStore("refresh-viejo");
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => tokens("access-2", "refresh-nuevo"),
      "GET /api/v1/auth/me": () => json(user()),
    });
    const session = manager(api.fetch, store);

    await session.restore();

    expect(await api.calls("POST /api/v1/auth/refresh")[0]?.json()).toEqual({
      client: "mobile",
      refresh_token: "refresh-viejo",
    });
    expect(store.value).toBe("refresh-nuevo");
    expect(api.calls("GET /api/v1/auth/me")[0]?.headers.get("Authorization")).toBe(
      "Bearer access-2",
    );
    expect(session.getSnapshot()).toEqual({ status: "authenticated", user: user() });
  });

  it("si el refresh fue revocado, borra el token guardado", async () => {
    const store = memoryStore("refresh-revocado");
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => problem(401, "not_authenticated"),
    });
    const session = manager(api.fetch, store);

    await session.restore();

    expect(store.value).toBeNull();
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("inicia sesión como cliente móvil y guarda el refresh token", async () => {
    const store = memoryStore();
    const api = createFakeApi({
      "POST /api/v1/auth/login": () => tokens("access-1", "refresh-1"),
      "GET /api/v1/auth/me": () => json(user()),
    });
    const session = manager(api.fetch, store);

    await session.login("ana@example.test", "una frase larga");

    expect(await api.calls("POST /api/v1/auth/login")[0]?.json()).toEqual({
      email: "ana@example.test",
      password: "una frase larga",
      client: "mobile",
    });
    expect(store.value).toBe("refresh-1");
    expect(session.getSnapshot().status).toBe("authenticated");
  });

  it("rechaza las cuentas del personal y revoca la sesión que abrió", async () => {
    const store = memoryStore();
    const api = createFakeApi({
      "POST /api/v1/auth/login": () => tokens(),
      "GET /api/v1/auth/me": () => json(staff()),
      "POST /api/v1/auth/logout": () => empty(),
    });
    const session = manager(api.fetch, store);

    await expect(session.login("recepcion@example.test", "x")).rejects.toMatchObject({
      message: expect.stringContaining("dueños y responsables de mascotas"),
    });
    expect(await api.calls("POST /api/v1/auth/logout")[0]?.json()).toEqual({
      refresh_token: "refresh-1",
    });
    expect(store.value).toBeNull();
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("comparte una sola renovación entre llamadas simultáneas", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": async () => {
        await gate;
        return tokens();
      },
      "GET /api/v1/auth/me": () => json(user()),
    });
    const session = manager(api.fetch, memoryStore("refresh-0"));

    const results = Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    release();

    expect(await results).toEqual([true, true, true]);
    expect(api.calls("POST /api/v1/auth/refresh")).toHaveLength(1);
  });

  it("cierra la sesión en el dispositivo aunque la API no responda", async () => {
    const store = memoryStore("refresh-0");
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => tokens(),
      "GET /api/v1/auth/me": () => json(user()),
      "POST /api/v1/auth/logout": () => {
        throw new TypeError("sin red");
      },
    });
    const session = manager(api.fetch, store);
    await session.restore();

    await session.logout();

    expect(store.value).toBeNull();
    expect(session.getSnapshot()).toEqual({ status: "anonymous", reason: "logged_out" });
  });

  it("un 401 que no se puede renovar termina la sesión como vencida", async () => {
    let refreshOk = true;
    const api = createFakeApi({
      "POST /api/v1/auth/refresh": () => (refreshOk ? tokens() : problem(401, "not_authenticated")),
      "GET /api/v1/auth/me": () => json(user()),
    });
    const session = manager(api.fetch, memoryStore("refresh-0"));
    await session.restore();
    refreshOk = false;

    expect(await session.handleUnauthorized()).toBe(false);
    expect(session.getSnapshot()).toEqual({ status: "anonymous", reason: "expired" });
  });
});
