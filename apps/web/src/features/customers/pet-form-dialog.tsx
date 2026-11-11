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
import { errorMessage, unwrap } from "@/lib/api-error";
import { applyFieldErrors } from "@/lib/form-errors";

import { blankToNull, SEX_LABELS, SEXES, SPECIES, SPECIES_LABELS, type Pet } from "./labels";
import { PETS } from "./queries";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

const schema = z.object({
  name: z.string().trim().min(1, "Ingresa el nombre de la mascota.").max(60, "Máximo 60."),
  species: z.enum(["dog", "cat", "rabbit", "bird", "rodent", "reptile", "other"]),
  sex: z.enum(["male", "female", "unknown"]),
  breed: z.string().trim().max(60, "Máximo 60 caracteres."),
  birth_date: z
    .string()
    .refine((value) => value === "" || value <= today(), "No puede ser una fecha futura."),
  birth_date_approximate: z.boolean(),
  color: z.string().trim().max(60, "Máximo 60 caracteres."),
  allergies: z.string().trim().max(1000, "Máximo 1000 caracteres."),
  notes: z.string().trim().max(2000, "Máximo 2000 caracteres."),
});

type Values = z.infer<typeof schema>;
const FIELDS = Object.keys(schema.shape) as (keyof Values)[];

type PetFormDialogProps = { onSaved: (pet: Pet) => void; onClose: () => void } & (
  | { editing: Pet; ownerId?: never; ownerName?: never }
  | { editing?: never; ownerId: string; ownerName: string }
);

/** Alta (con un cliente como dueño) o edición del perfil de una mascota. */
export function PetFormDialog({
  editing,
  ownerId,
  ownerName,
  onSaved,
  onClose,
}: PetFormDialogProps) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const speciesId = useId();
  const sexId = useId();
  const allergiesId = useId();
  const notesId = useId();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? "",
      species: editing?.species ?? "dog",
      sex: editing?.sex ?? "unknown",
      breed: editing?.breed ?? "",
      birth_date: editing?.birth_date ?? "",
      birth_date_approximate: editing?.birth_date_approximate ?? false,
      color: editing?.color ?? "",
      allergies: editing?.allergies ?? "",
      notes: editing?.notes ?? "",
    },
  });

  const save = useMutation({
    mutationFn: (values: Values) => {
      const birthDate = values.birth_date || null;
      const body = {
        name: values.name,
        species: values.species,
        sex: values.sex,
        breed: blankToNull(values.breed),
        birth_date: birthDate,
        birth_date_approximate: birthDate !== null && values.birth_date_approximate,
        color: blankToNull(values.color),
        allergies: blankToNull(values.allergies),
        notes: blankToNull(values.notes),
      };
      return editing
        ? unwrap(
            api.PUT("/api/v1/pets/{pet_id}", { params: { path: { pet_id: editing.id } }, body }),
          )
        : unwrap(
            api.POST("/api/v1/clients/{client_id}/pets", {
              params: { path: { client_id: ownerId } },
              body,
            }),
          );
    },
    onSuccess: async (pet) => {
      await queryClient.invalidateQueries({ queryKey: PETS });
      onSaved(pet);
    },
    onError: (error) => {
      applyFieldErrors(error, setError, FIELDS);
    },
  });

  const generalError =
    save.error && Object.keys(errors).length === 0 ? errorMessage(save.error) : null;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? `Editar a ${editing.name}` : "Nueva mascota"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Las notas internas solo las ve el personal."
            : `${ownerName} quedará como su dueño. Después puedes agregar más responsables.`}
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
            label="Nombre"
            autoComplete="off"
            error={errors.name?.message}
            {...register("name")}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={speciesId}>Especie</Label>
              <Select id={speciesId} {...register("species")}>
                {SPECIES.map((species) => (
                  <option key={species} value={species}>
                    {SPECIES_LABELS[species]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={sexId}>Sexo</Label>
              <Select id={sexId} {...register("sex")}>
                {SEXES.map((sex) => (
                  <option key={sex} value={sex}>
                    {SEX_LABELS[sex]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Raza (opcional)"
              autoComplete="off"
              error={errors.breed?.message}
              {...register("breed")}
            />
            <FormField
              label="Color (opcional)"
              autoComplete="off"
              error={errors.color?.message}
              {...register("color")}
            />
          </div>
          <div className="grid gap-3">
            <FormField
              label="Fecha de nacimiento (opcional)"
              type="date"
              max={today()}
              error={errors.birth_date?.message}
              {...register("birth_date")}
            />
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                {...register("birth_date_approximate")}
              />
              La fecha es aproximada
            </label>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={allergiesId}>Alergias (opcional)</Label>
            <Textarea
              id={allergiesId}
              className="min-h-20"
              aria-invalid={errors.allergies ? true : undefined}
              {...register("allergies")}
            />
            {errors.allergies ? (
              <p className="text-sm text-destructive">{errors.allergies.message}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={notesId}>Notas internas (opcional)</Label>
            <Textarea
              id={notesId}
              className="min-h-20"
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
            {editing ? "Guardar cambios" : "Registrar mascota"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
