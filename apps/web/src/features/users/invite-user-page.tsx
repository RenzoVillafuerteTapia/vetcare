import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { fieldErrors, type Role, type Schemas } from "@vetcare/shared";
import { CircleAlert, LoaderCircle, MailCheck, RotateCw } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { emailSchema } from "@/features/auth/schemas";
import { useSessionManager } from "@/features/auth/session-context";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "Administración", description: "Usuarios, configuración y reportes." },
  { value: "veterinarian", label: "Veterinaria", description: "Atención clínica y altas." },
  { value: "assistant", label: "Asistencia", description: "Avance de servicios y etapas." },
  { value: "receptionist", label: "Recepción", description: "Clientes, mascotas y agenda." },
  {
    value: "client",
    label: "Cliente",
    description: "Dueño o responsable de mascotas (app móvil).",
  },
];

const schema = z.object({
  email: emailSchema,
  full_name: z
    .string()
    .trim()
    .min(2, "Ingresa el nombre completo.")
    .max(150, "El nombre es demasiado largo."),
  roles: z
    .array(z.enum(["admin", "veterinarian", "assistant", "receptionist", "client"]))
    .min(1, "Elige al menos un rol.")
    .refine((roles) => !(roles.includes("client") && roles.length > 1), {
      message: "Una cuenta de cliente no puede tener roles del personal.",
    }),
});

type Values = z.infer<typeof schema>;
type InvitedUser = Schemas["UserResponse"];

export function InviteUserPage() {
  const { api } = useSessionManager();
  const [invited, setInvited] = useState<InvitedUser | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", full_name: "", roles: [] },
  });

  const invite = useMutation({
    mutationFn: (values: Values) => unwrap(api.POST("/api/v1/users", { body: values })),
    onSuccess: (user) => {
      setInvited(user);
      reset();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setError("email", { message: errorMessage(error) });
      } else if (error instanceof ApiError && error.status === 422) {
        for (const [field, messages] of Object.entries(fieldErrors(error.problem))) {
          if (field === "email" || field === "full_name" || field === "roles") {
            setError(field, { message: messages.join(" ") });
          }
        }
      }
    },
  });

  const resend = useMutation({
    mutationFn: (userId: string) =>
      unwrap(
        api.POST("/api/v1/users/{user_id}/invitation", { params: { path: { user_id: userId } } }),
      ),
  });

  const generalError =
    invite.error && !(invite.error instanceof ApiError && [409, 422].includes(invite.error.status))
      ? errorMessage(invite.error)
      : null;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Invitar usuario"
        description="La persona recibirá un correo para activar su cuenta y elegir su contraseña. El enlace vence en 7 días."
      />

      {invited ? (
        <Alert variant="success" className="mb-6">
          <MailCheck aria-hidden />
          <AlertTitle>Invitación enviada a {invited.email}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{invited.full_name} aparecerá como pendiente hasta que active su cuenta.</span>
            <Button
              size="sm"
              variant="outline"
              disabled={resend.isPending}
              onClick={() => resend.mutate(invited.id)}
            >
              <RotateCw aria-hidden className={cn(resend.isPending && "animate-spin")} />
              Reenviar invitación
            </Button>
            {resend.isSuccess ? (
              <span>Se envió un enlace nuevo; el anterior dejó de valer.</span>
            ) : null}
            {resend.isError ? <span>{errorMessage(resend.error)}</span> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <form onSubmit={handleSubmit((values) => invite.mutate(values))} noValidate>
          <CardContent className="grid gap-5">
            {generalError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertDescription>{generalError}</AlertDescription>
              </Alert>
            ) : null}
            <FormField
              label="Correo"
              type="email"
              autoComplete="off"
              error={errors.email?.message}
              {...register("email")}
            />
            <FormField
              label="Nombre completo"
              autoComplete="off"
              error={errors.full_name?.message}
              {...register("full_name")}
            />
            <Controller
              control={control}
              name="roles"
              render={({ field }) => (
                <fieldset
                  className="grid gap-2"
                  aria-describedby={errors.roles ? "roles-error" : undefined}
                >
                  <legend className="mb-2 text-sm font-medium">Roles</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ROLE_OPTIONS.map((option) => {
                      const checked = field.value.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition-colors hover:bg-accent/50",
                            checked && "border-primary bg-secondary/60",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-primary"
                            checked={checked}
                            onChange={(event) =>
                              field.onChange(
                                event.target.checked
                                  ? [...field.value, option.value]
                                  : field.value.filter((role) => role !== option.value),
                              )
                            }
                          />
                          <span className="grid gap-0.5">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-muted-foreground">{option.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.roles ? (
                    <p id="roles-error" className="text-sm text-destructive">
                      {errors.roles.message}
                    </p>
                  ) : null}
                </fieldset>
              )}
            />
          </CardContent>
          <CardFooter className="mt-6 justify-end">
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              Enviar invitación
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
