import { fieldErrors } from "@vetcare/shared";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiError } from "./api-error";

/**
 * Pone junto a cada campo los errores de una respuesta 422. Devuelve `false` si el error no
 * correspondía a ningún campo del formulario, para mostrarlo como aviso general.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || error.status !== 422) {
    return false;
  }
  let applied = false;
  for (const [field, messages] of Object.entries(fieldErrors(error.problem))) {
    const known = fields.find((name) => name === field);
    if (known) {
      setError(known, { message: messages.join(" ") });
      applied = true;
    }
  }
  return applied;
}
