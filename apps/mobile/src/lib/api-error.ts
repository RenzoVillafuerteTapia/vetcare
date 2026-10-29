import { isProblemDetails, type ProblemDetails } from "@vetcare/shared";

/** Error de la API con su cuerpo problem+json, para usar en consultas y mutaciones. */
export class ApiError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }

  get status(): number {
    return this.problem.status;
  }
}

const NETWORK_PROBLEM: ProblemDetails = {
  type: "/errors/network",
  title: "No se pudo conectar con el servidor",
  status: 0,
  code: "network_error",
  detail: "Revisa tu conexión e intenta de nuevo.",
};

/** Convierte el resultado de openapi-fetch en datos o en un `ApiError`. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await request;
  } catch {
    throw new ApiError(NETWORK_PROBLEM);
  }
  if (result.error !== undefined || !result.response.ok) {
    if (isProblemDetails(result.error)) {
      throw new ApiError(result.error);
    }
    throw new ApiError({
      type: "/errors/unexpected",
      title: "Ocurrió un error inesperado",
      status: result.response.status,
      code: "unexpected_error",
    });
  }
  return result.data as T;
}

/** Mensaje para mostrar al usuario a partir de cualquier error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
