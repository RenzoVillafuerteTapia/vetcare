import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSessionManager } from "@/features/auth/session-context";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { applyFieldErrors } from "@/lib/form-errors";

import { blankToNull, DOCUMENT_LABELS, DOCUMENT_TYPES, type Client } from "./labels";
import { CLIENTS } from "./queries";

const schema = z
  .object({
    full_name: z.string().trim().min(3, "Ingresa el nombre completo.").max(150, "Máximo 150."),
    document_type: z.enum(["dni", "ce", "passport"]),
    document_number: z
      .string()
      .trim()
      .min(6, "Ingresa el número de documento.")
      .max(20, "Máximo 20 caracteres."),
    phone: z.string().trim().min(6, "Ingresa un teléfono de contacto.").max(20, "Máximo 20."),
    email: z
      .string()
      .trim()
      .max(254, "El correo es demasiado largo.")
      .refine((value) => value === "" || z.email().safeParse(value).success, {
        message: "Ingresa un correo válido.",
      }),
    address: z.string().trim().max(200, "Máximo 200 caracteres."),
    notes: z.string().trim().max(1000, "Máximo 1000 caracteres."),
  })
  .refine((values) => values.document_type !== "dni" || /^\d{8}$/.test(values.document_number), {
    path: ["document_number"],
    message: "El DNI tiene 8 dígitos.",
  });

type Values = z.infer<typeof schema>;
const FIELDS = [
  "full_name",
  "document_type",
  "document_number",
  "phone",
  "email",
  "address",
  "notes",
] as const;

/** Conflictos de la API que pertenecen a un campo concreto. */
const CONFLICT_FIELDS: Record<string, keyof Values> = {
  document_taken: "document_number",
  email_taken: "email",
  email_locked_by_account: "email",
};

interface ClientFormDialogProps {
  editing: Client | null;
  onSaved: (client: Client) => void;
  onClose: () => void;
}

export function ClientFormDialog({ editing, onSaved, onClose }: ClientFormDialogProps) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const typeId = useId();
  const notesId = useId();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: editing?.full_name ?? "",
      document_type: editing?.document_type ?? "dni",
      document_number: editing?.document_number ?? "",
      phone: editing?.phone ?? "",
      email: editing?.email ?? "",
      address: editing?.address ?? "",
      notes: editing?.notes ?? "",
    },
  });

  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = {
        ...values,
        email: blankToNull(values.email),
        address: blankToNull(values.address),
        notes: blankToNull(values.notes),
      };
      return editing
        ? unwrap(
            api.PUT("/api/v1/clients/{client_id}", {
              params: { path: { client_id: editing.id } },
              body,
            }),
          )
        : unwrap(api.POST("/api/v1/clients", { body }));
    },
    onSuccess: async (client) => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS });
      onSaved(client);
    },
    onError: (error) => {
      const field = error instanceof ApiError ? CONFLICT_FIELDS[error.problem.code] : undefined;
      if (field) {
        setError(field, { message: errorMessage(error) });
      } else {
        applyFieldErrors(error, setError, FIELDS);
      }
    },
  });

  const generalError =
    save.error && Object.keys(errors).length === 0 ? errorMessage(save.error) : null;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        <DialogDescription>
          El correo es opcional, pero hace falta para invitar al cliente a la app.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <div className="grid gap-5">
          {generalError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertDescription>{generalError}</AlertDescription>
            </Alert>
          ) : null}
          <FormField
            label="Nombre completo"
            autoComplete="off"
            error={errors.full_name?.message}
            {...register("full_name")}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={typeId}>Tipo de documento</Label>
              <Select id={typeId} {...register("document_type")}>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DOCUMENT_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
            <FormField
              label="Número de documento"
              autoComplete="off"
              error={errors.document_number?.message}
              {...register("document_number")}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Teléfono"
              type="tel"
              autoComplete="off"
              error={errors.phone?.message}
              {...register("phone")}
            />
            <FormField
              label="Correo (opcional)"
              type="email"
              autoComplete="off"
              error={errors.email?.message}
              {...register("email")}
            />
          </div>
          <FormField
            label="Dirección (opcional)"
            autoComplete="off"
            error={errors.address?.message}
            {...register("address")}
          />
          <div className="grid gap-2">
            <Label htmlFor={notesId}>Notas (opcional)</Label>
            <Textarea
              id={notesId}
              aria-invalid={errors.notes ? true : undefined}
              {...register("notes")}
            />
            {errors.notes ? (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            ) : null}
          </div>
        </div>
        <DialogFooter className="mt-8">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {editing ? "Guardar cambios" : "Registrar cliente"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
