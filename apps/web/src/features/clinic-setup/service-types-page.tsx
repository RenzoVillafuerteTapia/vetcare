import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle, Pencil, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { cn } from "@/lib/utils";

import {
  CATEGORIES,
  CATEGORY_LABELS,
  formatDuration,
  KIND_LABELS,
  KINDS,
  type ServiceType,
} from "./labels";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";

const SERVICE_TYPES = ["clinic", "service-types"] as const;

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Usa de 2 a 40 minúsculas, números o guiones."),
  name: z.string().trim().min(2, "Ingresa el nombre del servicio.").max(100, "Máximo 100."),
  category: z.enum([
    "consultation",
    "vaccination",
    "grooming",
    "surgery",
    "hospitalization",
    "other",
  ]),
  duration_minutes: z
    .number({ error: "Ingresa la duración en minutos." })
    .int("Usa minutos enteros.")
    .min(5, "Mínimo 5 minutos.")
    .max(600, "Máximo 600 minutos.")
    .multipleOf(5, "Usa múltiplos de 5 minutos."),
  required_resources: z
    .array(
      z.enum([
        "veterinarian",
        "groomer",
        "consultation_room",
        "grooming_station",
        "operating_room",
      ]),
    )
    .min(1, "Elige al menos un recurso que ocupe el servicio."),
  bookable_by_client: z.boolean(),
  description: z.string().trim().max(500, "Máximo 500 caracteres."),
});

type Values = z.infer<typeof schema>;
const FIELDS = Object.keys(schema.shape) as (keyof Values)[];

const EMPTY: Values = {
  code: "",
  name: "",
  category: "consultation",
  duration_minutes: 30,
  required_resources: [],
  bookable_by_client: true,
  description: "",
};

function ServiceTypeDialog({
  editing,
  onClose,
}: {
  editing: ServiceType | null;
  onClose: () => void;
}) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const categoryId = useId();
  const descriptionId = useId();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          code: editing.code,
          name: editing.name,
          category: editing.category,
          duration_minutes: editing.duration_minutes,
          required_resources: editing.required_resources,
          bookable_by_client: editing.bookable_by_client,
          description: editing.description,
        }
      : EMPTY,
  });

  const save = useMutation({
    mutationFn: ({ code, ...fields }: Values) =>
      editing
        ? unwrap(
            api.PUT("/api/v1/clinic/service-types/{service_type_id}", {
              params: { path: { service_type_id: editing.id } },
              body: fields,
            }),
          )
        : unwrap(api.POST("/api/v1/clinic/service-types", { body: { code, ...fields } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SERVICE_TYPES });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.problem.code === "code_taken") {
        setError("code", { message: errorMessage(error) });
      } else {
        applyFieldErrors(error, setError, FIELDS);
      }
    },
  });

  // Los errores que ya quedaron junto a un campo no se repiten como aviso general.
  const hasFieldError = Object.keys(errors).length > 0;
  const generalError = save.error && !hasFieldError ? errorMessage(save.error) : null;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
        <DialogDescription>
          La duración y los recursos definen qué horarios ofrece la agenda para este servicio.
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
          <FormField label="Nombre" error={errors.name?.message} {...register("name")} />
          <FormField
            label="Código"
            hint={
              editing
                ? "El código identifica al servicio y no se puede cambiar."
                : "Identificador estable, por ejemplo bano-y-corte."
            }
            readOnly={editing !== null}
            error={errors.code?.message}
            {...register("code")}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={categoryId}>Categoría</Label>
              <Select id={categoryId} {...register("category")}>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </div>
            <FormField
              label="Duración (minutos)"
              type="number"
              min={5}
              max={600}
              step={5}
              error={errors.duration_minutes?.message}
              {...register("duration_minutes", { valueAsNumber: true })}
            />
          </div>
          <Controller
            control={control}
            name="required_resources"
            render={({ field }) => (
              <fieldset
                className="grid gap-2"
                aria-describedby={errors.required_resources ? "resources-error" : undefined}
              >
                <legend className="mb-2 text-sm font-semibold">Recursos que ocupa</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {KINDS.map((kind) => {
                    const checked = field.value.includes(kind);
                    return (
                      <label
                        key={kind}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/50",
                          checked && "border-primary bg-secondary/60",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={checked}
                          onChange={(event) =>
                            field.onChange(
                              event.target.checked
                                ? [...field.value, kind]
                                : field.value.filter((value) => value !== kind),
                            )
                          }
                        />
                        {KIND_LABELS[kind]}
                      </label>
                    );
                  })}
                </div>
                {errors.required_resources ? (
                  <p id="resources-error" className="text-sm text-destructive">
                    {errors.required_resources.message}
                  </p>
                ) : null}
              </fieldset>
            )}
          />
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              {...register("bookable_by_client")}
            />
            <span className="grid gap-0.5">
              <span className="font-semibold">Los clientes pueden solicitarlo desde la app</span>
              <span className="text-muted-foreground">
                Si no, solo el personal lo agenda (por ejemplo, las cirugías).
              </span>
            </span>
          </label>
          <div className="grid gap-2">
            <Label htmlFor={descriptionId}>Descripción (opcional)</Label>
            <Textarea
              id={descriptionId}
              aria-invalid={errors.description ? true : undefined}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            ) : null}
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {editing ? "Guardar cambios" : "Crear servicio"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function ServiceTypesPage() {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  // `null` = cerrado; "new" = alta; un servicio = edición.
  const [dialog, setDialog] = useState<ServiceType | "new" | null>(null);

  const serviceTypes = useQuery({
    queryKey: SERVICE_TYPES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/service-types")),
  });

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      unwrap(
        api.PATCH("/api/v1/clinic/service-types/{service_type_id}/active", {
          params: { path: { service_type_id: id } },
          body: { active },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICE_TYPES }),
  });

  return (
    <section aria-labelledby="servicios" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="servicios" className="text-xl font-medium">
          Catálogo de servicios
        </h2>
        <Button onClick={() => setDialog("new")}>
          <Plus aria-hidden />
          Nuevo servicio
        </Button>
      </div>

      {setActive.isError ? <ErrorState error={setActive.error} /> : null}

      {serviceTypes.isPending ? (
        <LoadingState label="Cargando el catálogo…" />
      ) : serviceTypes.isError ? (
        <ErrorState error={serviceTypes.error} onRetry={() => void serviceTypes.refetch()} />
      ) : serviceTypes.data.length === 0 ? (
        <EmptyState title="Todavía no hay servicios">
          <p className="text-muted-foreground">
            Crea el primero para que la agenda pueda ofrecer horarios.
          </p>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {serviceTypes.data.map((service) => (
            <li
              key={service.id}
              className={cn(
                "grid gap-3 rounded-3xl border border-border/70 bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center",
                !service.active && "bg-sidebar",
              )}
            >
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-medium">{service.name}</h3>
                  <Badge variant="soft">{CATEGORY_LABELS[service.category]}</Badge>
                  {service.active ? null : <Badge>Inactivo</Badge>}
                  {service.bookable_by_client ? null : <Badge>Solo personal</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDuration(service.duration_minutes)} ·{" "}
                  {service.required_resources.map((kind) => KIND_LABELS[kind]).join(" + ")}
                </p>
                {service.description ? <p className="text-sm">{service.description}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Editar ${service.name}`}
                  onClick={() => setDialog(service)}
                >
                  <Pencil aria-hidden />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${service.active ? "Desactivar" : "Activar"} ${service.name}`}
                  disabled={setActive.isPending}
                  onClick={() => setActive.mutate({ id: service.id, active: !service.active })}
                >
                  {service.active ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog !== null ? (
          <ServiceTypeDialog
            key={dialog === "new" ? "new" : dialog.id}
            editing={dialog === "new" ? null : dialog}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
