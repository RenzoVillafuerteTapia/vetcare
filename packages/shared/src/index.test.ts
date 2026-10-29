import { describe, expect, it } from "vitest";

import { createApiClient, fieldErrors, isProblemDetails, type ProblemDetails } from "./index";

function fakeFetch(respond: (request: Request) => Response) {
  const requests: Request[] = [];
  const fetch = async (request: Request) => {
    requests.push(request);
    return respond(request);
  };
  return { fetch, requests };
}

const json = (body: unknown, status = 200, type = "application/json") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });

describe("createApiClient", () => {
  it("envía el access token como Bearer", async () => {
    const { fetch, requests } = fakeFetch(() =>
      json({ id: "1", email: "a@example.test", full_name: "A", roles: [], status: "active", permissions: [] }),
    );
    const api = createApiClient({ baseUrl: "http://api.test/", getAccessToken: () => "abc", fetch });

    const { data } = await api.GET("/api/v1/auth/me");

    expect(requests[0]?.url).toBe("http://api.test/api/v1/auth/me");
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer abc");
    expect(data?.email).toBe("a@example.test");
  });

  it("no agrega Authorization si no hay sesión", async () => {
    const { fetch, requests } = fakeFetch(() => json({ status: "ok" }));
    const api = createApiClient({ baseUrl: "http://api.test", getAccessToken: async () => null, fetch });

    await api.GET("/api/v1/health");

    expect(requests[0]?.headers.has("Authorization")).toBe(false);
  });

  it("entrega el problem+json de la API como error tipado", async () => {
    const problem: ProblemDetails = {
      type: "/errors/not-authenticated",
      title: "Debes iniciar sesión",
      status: 401,
      code: "not_authenticated",
      detail: "Correo o contraseña incorrectos.",
    };
    const { fetch } = fakeFetch(() => json(problem, 401, "application/problem+json"));
    const api = createApiClient({ baseUrl: "http://api.test", fetch });

    const { data, error, response } = await api.POST("/api/v1/auth/login", {
      body: { email: "a@example.test", password: "x", client: "web" },
    });

    expect(data).toBeUndefined();
    expect(response.status).toBe(401);
    expect(isProblemDetails(error)).toBe(true);
    expect(error).toEqual(problem);
  });
});

describe("utilidades de errores", () => {
  it("reconoce solo objetos con la forma de ProblemDetails", () => {
    expect(isProblemDetails({ code: "conflict", title: "x", status: 409 })).toBe(true);
    expect(isProblemDetails({ message: "error" })).toBe(false);
    expect(isProblemDetails(null)).toBe(false);
    expect(isProblemDetails("error")).toBe(false);
  });

  it("agrupa los errores por campo", () => {
    const problem: ProblemDetails = {
      type: "/errors/validation-failed",
      title: "Los datos enviados no son válidos",
      status: 422,
      code: "validation_failed",
      errors: [
        { field: "password", message: "Debe tener al menos 10 caracteres." },
        { field: "password", message: "Es demasiado común. Elige otra." },
        { field: "email", message: "Ingresa un correo válido." },
      ],
    };

    expect(fieldErrors(problem)).toEqual({
      password: ["Debe tener al menos 10 caracteres.", "Es demasiado común. Elige otra."],
      email: ["Ingresa un correo válido."],
    });
  });
});
