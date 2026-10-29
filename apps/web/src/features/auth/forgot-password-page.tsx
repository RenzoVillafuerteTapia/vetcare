import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, LoaderCircle, MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessage, unwrap } from "@/lib/api-error";

import { AuthLayout } from "./auth-layout";
import { emailSchema } from "./schemas";
import { useSessionManager } from "./session-context";

const schema = z.object({ email: emailSchema });

export function ForgotPasswordPage() {
  const { api } = useSessionManager();
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setSubmitError(null);
    try {
      await unwrap(api.POST("/api/v1/auth/password-reset", { body: { email } }));
      setSent(true);
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  });

  if (sent) {
    return (
      <AuthLayout title="Revisa tu correo">
        <div className="grid gap-4">
          <Alert variant="success">
            <MailCheck aria-hidden />
            <AlertDescription>
              Si el correo pertenece a una cuenta activa, recibirás un enlace para elegir una nueva
              contraseña. El enlace vence en 30 minutos.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link to="/login">Volver al inicio de sesión</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      description="Te enviaremos un enlace para elegir una nueva contraseña."
    >
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        {submitError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          label="Correo"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Enviar enlace
        </Button>
        <Link
          to="/login"
          className="text-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </form>
    </AuthLayout>
  );
}
