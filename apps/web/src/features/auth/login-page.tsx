import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";

import { AuthLayout } from "./auth-layout";
import { emailSchema } from "./schemas";
import { useSessionManager } from "./session-context";

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresa tu contraseña."),
});

type LoginValues = z.infer<typeof loginSchema>;

type LocationState = { from?: string; reason?: "expired" | "logged_out" } | null;

export function LoginPage() {
  const session = useSessionManager();
  const navigate = useNavigate();
  const state = useLocation().state as LocationState;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    try {
      await session.login(email, password);
      await navigate(state?.from && state.from !== "/login" ? state.from : "/", { replace: true });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  });

  return (
    <AuthLayout title="Iniciar sesión" description="Ingresa con tu cuenta de la veterinaria.">
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        {state?.reason === "expired" && !submitError ? (
          <Alert>
            <CircleAlert aria-hidden />
            <AlertDescription>Tu sesión venció. Ingresa de nuevo.</AlertDescription>
          </Alert>
        ) : null}
        {submitError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          label="Correo"
          type="email"
          autoComplete="username"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Ingresar
        </Button>
        <Link
          to="/recuperar-contrasena"
          className="text-center text-sm text-primary underline-offset-4 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </AuthLayout>
  );
}
