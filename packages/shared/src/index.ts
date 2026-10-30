/**
 * Contratos compartidos entre la web de administración y la app móvil.
 *
 * `schema.d.ts` se genera desde el OpenAPI de la API (`npm run contracts:generate`); no se edita
 * a mano. Este módulo solo agrega un cliente HTTP tipado y utilidades sobre esos tipos.
 */
import createClient, { type Client, type Middleware } from "openapi-fetch";

import type { components, paths } from "./schema";

export type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type ProblemDetails = Schemas["ProblemDetails"];
export type FieldProblem = Schemas["FieldProblem"];
export type Role = Schemas["Role"];
export type Permission = Schemas["Permission"];
export type CurrentUser = Schemas["CurrentUserResponse"];
export type TokenResponse = Schemas["TokenResponse"];

export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  /** Origen de la API, p. ej. `http://localhost:8000`. Las rutas ya incluyen `/api/v1`. */
  baseUrl: string;
  /** Devuelve el access token vigente, o nada si no hay sesión. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** `include` en la web, para que viaje la cookie del refresh token. */
  credentials?: RequestCredentials;
  fetch?: (input: Request) => Promise<Response>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ""),
    ...(options.credentials ? { credentials: options.credentials } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  const { getAccessToken } = options;
  if (getAccessToken) {
    const auth: Middleware = {
      async onRequest({ request }) {
        const token = await getAccessToken();
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
        }
        return request;
      },
    };
    client.use(auth);
  }
  return client;
}

/** Distingue un error de la API (RFC 9457) de cualquier otro valor. */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.status === "number"
  );
}

/** Errores por campo de una respuesta 422, indexados por la ruta del campo. */
export function fieldErrors(problem: ProblemDetails): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const { field, message } of problem.errors ?? []) {
    (result[field] ??= []).push(message);
  }
  return result;
}
