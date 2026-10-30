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

/** Respuesta sin cuerpo, con `Content-Length: 0` como la envía la API real. */
export const empty = (status = 204) =>
  new Response(null, { status, headers: { "Content-Length": "0" } });

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

export const tokens = (access = "access-1", refresh = "refresh-1") =>
  json({ access_token: access, token_type: "bearer", expires_in: 900, refresh_token: refresh });

export function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "0192f0a4-0000-7000-8000-000000000002",
    email: "ana@example.test",
    full_name: "Ana Pérez",
    roles: ["client"],
    status: "active",
    permissions: ["own:pets:read", "own:appointments:manage", "own:tracking:read"],
    ...overrides,
  };
}

export const staff = () =>
  user({
    email: "recepcion@example.test",
    full_name: "Rita Recepción",
    roles: ["receptionist"],
    permissions: ["clients:manage", "pets:read"],
  });
