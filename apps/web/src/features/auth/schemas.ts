import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Ingresa tu correo.")
  .pipe(z.email("Ingresa un correo válido."));

/** Reglas mínimas en el cliente; la API aplica además la política completa. */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Debe tener al menos 10 caracteres.")
      .max(128, "Debe tener como máximo 128 caracteres."),
    confirmation: z.string().min(1, "Repite la contraseña."),
  })
  .refine((v) => v.password === v.confirmation, {
    path: ["confirmation"],
    message: "Las contraseñas no coinciden.",
  });

export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

/** El token de los enlaces de correo viaja en el fragmento: `#token=…`. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && token.length >= 10 ? token : null;
}
