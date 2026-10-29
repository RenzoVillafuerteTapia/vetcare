import { zodResolver } from "@hookform/resolvers/zod";
import { fieldErrors } from "@vetcare/shared";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";

import { AuthLayout } from "./auth-layout";
import { newPasswordSchema, tokenFromHash, type NewPasswordValues } from "./schemas";
import { useSessionManager } from "./session-context";

type Mode = "activate" | "reset";

const COPY: Record<Mode, { title: string; description: string; done: string; submit: string }> = {
  activate: {
    title: "Activa tu cuenta",
    description: "Elige la contraseña con la que ingresarás a la plataforma.",
    done: "Tu cuenta está activa. Ya puedes iniciar sesión.",
    submit: "Activar cuenta",
  },
  reset: {
    title: "Nueva contraseña",
    description: "Al cambiarla se cerrarán todas tus sesiones abiertas.",
    done: "Tu contraseña se actualizó. Inicia sesión con la nueva.",
    submit: "Guardar contraseña",
  },
};

/** Activación de cuenta invitada y restablecimiento de contraseña: ambos fijan una contraseña
 * con el token de un solo uso que llega en el enlace del correo. */
export function SetPasswordPage({ mode }: { mode: Mode }) {
  const { api } = useSessionManager();
  const token = tokenFromHash(useLocation().hash);
  const copy = COPY[mode];
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) });

  if (!token) {
    return (
      <AuthLayout title={copy.title}>
        <div className="grid gap-4">
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>
              El enlace está incompleto. Ábrelo directamente desde el correo
              {mode === "reset"
                ? " o solicita uno nuevo."
                : " o pide que te reenvíen la invitación."}
            </AlertDescription>
          </Alert>
          {mode === "reset" ? (
            <Button asChild variant="outline">
              <Link to="/recuperar-contrasena">Solicitar un nuevo enlace</Link>
            </Button>
          ) : null}
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setSubmitError(null);
    const body = { token, password };
    try {
      await unwrap(
        mode === "activate"
          ? api.POST("/api/v1/auth/invitations/accept", { body })
          : api.POST("/api/v1/auth/password-reset/confirm", { body }),
      );
      setDone(true);
    } catch (error) {
      const passwordErrors =
        error instanceof ApiError && error.status === 422
          ? fieldErrors(error.problem).password
          : undefined;
      if (passwordErrors) {
        setError("password", { message: passwordErrors.join(" ") });
      } else {
        setSubmitError(errorMessage(error));
      }
    }
  });

  if (done) {
    return (
      <AuthLayout title={copy.title}>
        <div className="grid gap-4">
          <Alert variant="success">
            <CircleCheck aria-hidden />
            <AlertDescription>{copy.done}</AlertDescription>
          </Alert>
          <Button asChild>
            <Link to="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={copy.title} description={copy.description}>
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        {submitError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          hint="Al menos 10 caracteres. Una frase fácil de recordar funciona bien."
          error={errors.password?.message}
          {...register("password")}
        />
        <FormField
          label="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.confirmation?.message}
          {...register("confirmation")}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {copy.submit}
        </Button>
      </form>
    </AuthLayout>
  );
}
