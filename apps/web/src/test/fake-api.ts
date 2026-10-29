import type { CurrentUser, ProblemDetails } from "@vetcare/shared";

type Handler = (request: Request) => Response | Promise<Response>;

/** API simulada: responde según "MÉTODO /ruta" y registra cada solicitud. */
export function createFakeApi(handlers: Record<string, Handler>) {
  const requests: Request[] = [];
  const fetch = async (request: Request): Promise<Response> => {
    requests.push(request.clone());
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const handler = handlers[key];
    if (!handler) {
      return problem(404, "not_found", `Sin respuesta simulada para ${key}`);
    }
    return handler(request);
  };
  const calls = (key: string) =>
    requests.filter((r) => `${r.method} ${new URL(r.url).pathname}` === key);
  return { fetch, requests, calls };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const empty = (status = 204) => new Response(null, { status });

export function problem(
  status: number,
  code: string,
  detail?: string,
  errors?: ProblemDetails["errors"],
): Response {
  const body: ProblemDetails = {
    type: `/errors/${code.replaceAll("_", "-")}`,
    title: "Error",
    status,
    code,
    ...(detail ? { detail } : {}),
    ...(errors ? { errors } : {}),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

export const tokens = (access = "access-1") =>
  json({ access_token: access, token_type: "bearer", expires_in: 900, refresh_token: null });

export function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "0192f0a4-0000-7000-8000-000000000001",
    email: "ana@example.test",
    full_name: "Ana Pérez",
    roles: ["receptionist"],
    status: "active",
    permissions: ["clients:manage", "pets:read", "appointments:manage"],
    ...overrides,
  };
}

export const admin = () =>
  user({
    email: "admin@example.test",
    full_name: "Admin Inicial",
    roles: ["admin"],
    permissions: ["users:manage", "clients:manage", "pets:read"],
  });
