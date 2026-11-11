import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, CircleAlert, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
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
import { useSessionManager } from "@/features/auth/session-context";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { applyFieldErrors } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

import {
  formatDateTime,
  KIND_LABELS,
  KINDS,
  limaLocalToIso,
  type Resource,
  type ScheduleEntry,
} from "./labels";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { normalizeSchedule, scheduleProblem, scheduleSummary } from "./schedule";
import { ScheduleEditor } from "./schedule-editor";

const RESOURCES = ["clinic", "resources"] as const;

function scheduleErrorFrom(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const fields = new Set((error.problem.errors ?? []).map((e) => e.field.split(".")[0]));
  return ["schedule", "start", "end"].some((field) => fields.has(field))
    ? errorMessage(error)
    : null;
}

// --- Alta y edición ---------------------------------------------------------------------------

const resourceSchema = z.object({
  kind: z.enum([
    "veterinarian",
    "groomer",
    "consultation_room",
    "grooming_station",
    "operating_room",
  ]),
  name: z.string().trim().min(2, "Ingresa el nombre del recurso.").max(100, "Máximo 100."),
  active: z.boolean(),
});

type ResourceValues = z.infer<typeof resourceSchema>;

function ResourceDialog({ editing, onClose }: { editing: Resource | null; onClose: () => void }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const kindId = useId();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>(() =>
    normalizeSchedule(editing?.schedule ?? []),
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResourceValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      kind: editing?.kind ?? "veterinarian",
      name: editing?.name ?? "",
      active: editing?.active ?? true,
    },
  });

  const save = useMutation({
    mutationFn: ({ kind, name, active }: ResourceValues) =>
      editing
        ? unwrap(
            api.PUT("/api/v1/clinic/resources/{resource_id}", {
              params: { path: { resource_id: editing.id } },
              // La cuenta vinculada no se edita aquí: se conserva la que tenga.
              body: { name, schedule, active, user_id: editing.user_id },
            }),
          )
        : unwrap(api.POST("/api/v1/clinic/resources", { body: { kind, name, schedule } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RESOURCES });
      onClose();
    },
    onError: (error) => {
      applyFieldErrors(error, setError, ["name", "kind"]);
      setScheduleError(scheduleErrorFrom(error));
    },
  });

  const submit = handleSubmit((values) => {
    const problem = scheduleProblem(schedule);
    setScheduleError(problem);
    if (!problem) save.mutate(values);
  });

  const generalError =
    save.error && !scheduleError && Object.keys(errors).length === 0
      ? errorMessage(save.error)
      : null;

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar recurso" : "Nuevo recurso"}</DialogTitle>
        <DialogDescription>
          Un recurso es alguien o algo que una cita ocupa y que no puede estar en dos citas a la
          vez. Las horas son de la sede (America/Lima).
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate>
        <div className="grid gap-5">
          {generalError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertDescription>{generalError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Nombre" error={errors.name?.message} {...register("name")} />
            <div className="grid gap-2">
              <Label htmlFor={kindId}>Tipo</Label>
              {/* El tipo no cambia después del alta: las citas ya reservadas dependen de él. */}
              <Select
                id={kindId}
                {...(editing ? { disabled: true, value: editing.kind } : register("kind"))}
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {editing ? (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                {...register("active")}
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">Activo</span>
                <span className="text-muted-foreground">
                  Un recurso inactivo no recibe citas nuevas.
                </span>
              </span>
            </label>
          ) : null}
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Horario semanal</h3>
            <ScheduleEditor
              value={schedule}
              onChange={(value) => {
                setSchedule(value);
                setScheduleError(null);
              }}
              error={scheduleError}
              emptyLabel="No atiende"
            />
          </div>
        </div>
        <DialogFooter className="mt-8">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {editing ? "Guardar cambios" : "Crear recurso"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// --- Bloqueos ---------------------------------------------------------------------------------

const timeOffSchema = z
  .object({
    start: z.string().min(1, "Elige el inicio."),
    end: z.string().min(1, "Elige el fin."),
    reason: z.string().trim().max(200, "Máximo 200 caracteres."),
  })
  .refine((values) => !values.start || !values.end || values.start < values.end, {
    path: ["end"],
    message: "Debe ser posterior al inicio.",
  });

type TimeOffValues = z.infer<typeof timeOffSchema>;

function TimeOffDialog({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TimeOffValues>({
    resolver: zodResolver(timeOffSchema),
    defaultValues: { start: "", end: "", reason: "" },
  });

  const save = useMutation({
    mutationFn: (values: TimeOffValues) =>
      unwrap(
        api.POST("/api/v1/clinic/resources/{resource_id}/time-off", {
          params: { path: { resource_id: resource.id } },
          body: {
            start: limaLocalToIso(values.start),
            end: limaLocalToIso(values.end),
            reason: values.reason,
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RESOURCES });
      onClose();
    },
    onError: (error) => {
      applyFieldErrors(error, setError, ["start", "end", "reason"]);
    },
  });

  const generalError =
    save.error && Object.keys(errors).length === 0 ? errorMessage(save.error) : null;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Bloquear a {resource.name}</DialogTitle>
        <DialogDescription>
          Durante el bloqueo (vacaciones, mantenimiento) la agenda no ofrece este recurso. Las horas
          son de la sede.
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
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Desde"
              type="datetime-local"
              error={errors.start?.message}
              {...register("start")}
            />
            <FormField
              label="Hasta"
              type="datetime-local"
              error={errors.end?.message}
              {...register("end")}
            />
          </div>
          <FormField
            label="Motivo (opcional)"
            error={errors.reason?.message}
            {...register("reason")}
          />
        </div>
        <DialogFooter className="mt-8">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            Bloquear
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// --- Listado ----------------------------------------------------------------------------------

type DialogState =
  | { type: "new" }
  | { type: "edit"; resource: Resource }
  | { type: "time-off"; resource: Resource }
  | null;

export function ResourcesPage() {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>(null);

  const resources = useQuery({
    queryKey: RESOURCES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/resources")),
  });

  const removeTimeOff = useMutation({
    mutationFn: ({ resourceId, timeOffId }: { resourceId: string; timeOffId: string }) =>
      unwrap(
        api.DELETE("/api/v1/clinic/resources/{resource_id}/time-off/{time_off_id}", {
          params: { path: { resource_id: resourceId, time_off_id: timeOffId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESOURCES }),
  });

  return (
    <section aria-labelledby="recursos" className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recursos" className="text-2xl font-medium">
          Recursos de la agenda
        </h2>
        <Button onClick={() => setDialog({ type: "new" })}>
          <Plus aria-hidden />
          Nuevo recurso
        </Button>
      </div>

      {removeTimeOff.isError ? <ErrorState error={removeTimeOff.error} /> : null}

      {resources.isPending ? (
        <LoadingState label="Cargando los recursos…" />
      ) : resources.isError ? (
        <ErrorState error={resources.error} onRetry={() => void resources.refetch()} />
      ) : resources.data.length === 0 ? (
        <EmptyState title="Todavía no hay recursos">
          <p className="text-muted-foreground">
            Registra a los profesionales, consultorios y estaciones que atienden las citas.
          </p>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {resources.data.map((resource) => {
            const summary = scheduleSummary(resource.schedule);
            return (
              <li
                key={resource.id}
                className={cn(
                  "grid content-start gap-4 rounded-3xl border border-border/70 bg-card p-5",
                  !resource.active && "bg-sidebar",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-medium">{resource.name}</h3>
                  <Badge variant="soft">{KIND_LABELS[resource.kind]}</Badge>
                  {resource.active ? null : <Badge>Inactivo</Badge>}
                </div>
                {summary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin horario: no recibe citas.</p>
                ) : (
                  <ul className="grid gap-0.5 text-sm text-muted-foreground">
                    {summary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {resource.time_off.length > 0 ? (
                  <div className="grid gap-2">
                    <h4 className="text-sm font-semibold">Bloqueos</h4>
                    <ul className="grid gap-2">
                      {resource.time_off.map((block) => (
                        <li
                          key={block.id}
                          className="flex items-center justify-between gap-2 rounded-2xl bg-sidebar px-4 py-2 text-sm"
                        >
                          <span>
                            {formatDateTime(block.start)} – {formatDateTime(block.end)}
                            {block.reason ? (
                              <span className="text-muted-foreground"> · {block.reason}</span>
                            ) : null}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar el bloqueo de ${resource.name} del ${formatDateTime(block.start)}`}
                            disabled={removeTimeOff.isPending}
                            onClick={() =>
                              removeTimeOff.mutate({
                                resourceId: resource.id,
                                timeOffId: block.id,
                              })
                            }
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Editar ${resource.name}`}
                    onClick={() => setDialog({ type: "edit", resource })}
                  >
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Bloquear ${resource.name}`}
                    onClick={() => setDialog({ type: "time-off", resource })}
                  >
                    <CalendarOff aria-hidden />
                    Bloquear
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog?.type === "time-off" ? (
          <TimeOffDialog resource={dialog.resource} onClose={() => setDialog(null)} />
        ) : dialog ? (
          <ResourceDialog
            editing={dialog.type === "edit" ? dialog.resource : null}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
