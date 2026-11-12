import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pencil, Plus, UserMinus } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { ErrorState, LoadingState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { unwrap } from "@/lib/api-error";
import { applyFieldErrors } from "@/lib/form-errors";

import { GuardianDialog } from "./guardian-dialog";
import {
  formatAge,
  formatDay,
  formatInstantDay,
  formatKilograms,
  GUARDIAN_LABELS,
  PERMISSION_LABELS,
  SEX_LABELS,
  SPECIES_LABELS,
  STATUS_LABELS,
  STATUSES,
  type Guardian,
  type Pet,
  type PetStatus,
} from "./labels";
import { PetFormDialog } from "./pet-form-dialog";
import { PetPhotoEditor } from "./pet-photo";
import { petKey, PETS } from "./queries";

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value ?? "—"}</dd>
    </div>
  );
}

function birthText(pet: Pet): string | null {
  if (!pet.birth_date) return null;
  const approximate = pet.birth_date_approximate ? " (aproximada)" : "";
  return `${formatDay(pet.birth_date)}${approximate} · ${formatAge(pet.birth_date)}`;
}

// --- Estado -----------------------------------------------------------------------------------

function StatusSelect({ pet }: { pet: Pet }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const id = useId();

  const change = useMutation({
    mutationFn: (status: PetStatus) =>
      unwrap(
        api.PATCH("/api/v1/pets/{pet_id}/status", {
          params: { path: { pet_id: pet.id } },
          body: { status },
        }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(petKey(pet.id), updated);
      await queryClient.invalidateQueries({ queryKey: PETS });
    },
  });

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Estado</Label>
      <Select
        id={id}
        className="w-44"
        value={pet.status}
        disabled={change.isPending}
        onChange={(event) => change.mutate(event.target.value as PetStatus)}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </Select>
      {change.isError ? <ErrorState error={change.error} /> : null}
    </div>
  );
}

// --- Peso -------------------------------------------------------------------------------------

const weightSchema = z.object({
  kilograms: z
    .number({ error: "Ingresa el peso en kilos." })
    .positive("Debe ser mayor que 0.")
    .max(200, "Máximo 200 kg.")
    .refine((value) => Number.isInteger(Math.round(value * 1000) / 10), "Usa hasta 2 decimales."),
});

type WeightValues = z.infer<typeof weightSchema>;

function WeightsCard({ pet }: { pet: Pet }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const canManage = usePermission("pets:manage");
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<WeightValues>({ resolver: zodResolver(weightSchema) });

  const record = useMutation({
    mutationFn: ({ kilograms }: WeightValues) =>
      unwrap(
        api.POST("/api/v1/pets/{pet_id}/weights", {
          params: { path: { pet_id: pet.id } },
          body: { kilograms },
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(petKey(pet.id), updated);
      reset();
    },
    onError: (error) => {
      applyFieldErrors(error, setError, ["kilograms"]);
    },
  });

  // El más reciente primero.
  const weights = [...pet.weights].sort((a, b) => b.measured_at.localeCompare(a.measured_at));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Peso</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {weights.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se registró su peso.</p>
        ) : (
          <ol className="grid gap-2" aria-label="Historial de peso">
            {weights.map((weight, index) => (
              <li
                key={weight.measured_at}
                className="flex items-center justify-between gap-2 rounded-2xl bg-sidebar px-4 py-2 text-sm"
              >
                <span className={index === 0 ? "font-semibold" : undefined}>
                  {formatKilograms(weight.kilograms)}
                </span>
                <span className="text-muted-foreground">
                  {formatInstantDay(weight.measured_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
        {record.isError && !errors.kilograms ? <ErrorState error={record.error} /> : null}
        {canManage ? (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start"
            noValidate
            onSubmit={handleSubmit((values) => record.mutate(values))}
          >
            <FormField
              label="Nuevo peso (kg)"
              type="number"
              min={0}
              max={200}
              step={0.01}
              inputMode="decimal"
              error={errors.kilograms?.message}
              {...register("kilograms", { valueAsNumber: true })}
            />
            <Button type="submit" variant="outline" className="sm:mt-6" disabled={record.isPending}>
              {record.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Plus aria-hidden />
              )}
              Registrar peso
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

// --- Tutela -----------------------------------------------------------------------------------

function permissionsText(guardian: Guardian): string {
  if (guardian.kind === "owner") return "Todos los permisos";
  const granted = (Object.keys(PERMISSION_LABELS) as (keyof typeof PERMISSION_LABELS)[])
    .filter((key) => guardian.permissions[key])
    .map((key) => PERMISSION_LABELS[key].toLowerCase());
  return granted.length === 0 ? "Sin permisos" : `Puede ${granted.join(", ")}`;
}

function GuardiansCard({ pet }: { pet: Pet }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const canManage = usePermission("guardianships:manage");
  // `null` = cerrado; "new" = agregar; un responsable = editar sus permisos.
  const [dialog, setDialog] = useState<Guardian | "new" | null>(null);

  const revoke = useMutation({
    mutationFn: (clientId: string) =>
      unwrap(
        api.DELETE("/api/v1/pets/{pet_id}/guardians/{client_id}", {
          params: { path: { pet_id: pet.id, client_id: clientId } },
        }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(petKey(pet.id), updated);
      await queryClient.invalidateQueries({ queryKey: PETS });
    },
  });

  return (
    <Card>
      <CardHeader className="sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-1.5">
          <CardTitle>Dueños y responsables</CardTitle>
          <CardDescription>Quién decide por la mascota y quién puede recogerla.</CardDescription>
        </div>
        {canManage ? (
          <Button variant="outline" size="sm" onClick={() => setDialog("new")}>
            <Plus aria-hidden />
            Agregar responsable
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {revoke.isError ? <ErrorState error={revoke.error} /> : null}
        <ul className="grid gap-2" aria-label="Dueños y responsables">
          {pet.guardians.map((guardian) => (
            <li
              key={guardian.client_id}
              className="grid gap-3 rounded-2xl bg-sidebar px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="grid gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/clientes/${guardian.client_id}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {guardian.full_name}
                  </Link>
                  <Badge variant={guardian.kind === "owner" ? "soft" : "outline"}>
                    {GUARDIAN_LABELS[guardian.kind]}
                  </Badge>
                </span>
                <span className="text-muted-foreground">{permissionsText(guardian)}</span>
              </div>
              {canManage ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Cambiar los permisos de ${guardian.full_name}`}
                    onClick={() => setDialog(guardian)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar a ${guardian.full_name}`}
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(guardian.client_id)}
                  >
                    <UserMinus aria-hidden />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog !== null ? (
          <GuardianDialog
            key={dialog === "new" ? "new" : dialog.client_id}
            pet={pet}
            editing={dialog === "new" ? null : dialog}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

// --- Página -----------------------------------------------------------------------------------

export function PetPage() {
  const { petId = "" } = useParams();
  const { api } = useSessionManager();
  const canManage = usePermission("pets:manage");
  const [editing, setEditing] = useState(false);

  const pet = useQuery({
    queryKey: petKey(petId),
    queryFn: () =>
      unwrap(api.GET("/api/v1/pets/{pet_id}", { params: { path: { pet_id: petId } } })),
  });

  if (pet.isPending) {
    return <LoadingState label="Cargando el perfil de la mascota…" />;
  }
  if (pet.isError) {
    return <ErrorState error={pet.error} onRetry={() => void pet.refetch()} />;
  }
  const data = pet.data;

  return (
    <div className="grid max-w-6xl gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-medium md:text-3xl">{data.name}</h1>
              {data.status === "active" ? null : <Badge>{STATUS_LABELS[data.status]}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {SPECIES_LABELS[data.species]}
              {data.breed ? ` · ${data.breed}` : ""} · {SEX_LABELS[data.sex]}
            </p>
          </div>
          <PetPhotoEditor pet={data} />
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-end gap-3">
            <StatusSelect pet={data} />
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Editar perfil
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Nacimiento" value={birthText(data)} />
              <Fact label="Color" value={data.color} />
              <Fact label="Alergias" value={data.allergies} />
              <Fact label="Notas internas" value={data.notes} />
            </dl>
          </CardContent>
        </Card>
        <WeightsCard pet={data} />
      </div>

      <GuardiansCard pet={data} />

      <Dialog open={editing} onOpenChange={setEditing}>
        {editing ? (
          <PetFormDialog
            editing={data}
            onClose={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
