import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldAlert, X } from "lucide-react";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { errorMessage, unwrap } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import type { Pet } from "./labels";
import { PETS } from "./queries";

/** Las más frecuentes en la consulta: un toque y quedan registradas. */
const COMMON = ["Pollo", "Carne de res", "Granos", "Penicilina", "Pulgas (dermatitis)", "Látex"];

/** Las alergias se guardan como texto; aquí se manejan como lista (por comas o renglones). */
function splitAllergies(text: string | null): string[] {
  return (text ?? "")
    .split(/[,\n;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Alergias a la vista, arriba del perfil: en rojo si las hay, con un campo para agregar una sin
 * abrir el formulario completo y atajos para las más comunes.
 */
export function AllergiesCard({ pet }: { pet: Pet }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const canManage = usePermission("pets:manage");
  const inputId = useId();
  const [text, setText] = useState("");
  const list = splitAllergies(pet.allergies);
  const has = list.length > 0;

  const save = useMutation({
    mutationFn: (next: string[]) =>
      unwrap(
        api.PUT("/api/v1/pets/{pet_id}", {
          params: { path: { pet_id: pet.id } },
          body: {
            name: pet.name,
            species: pet.species,
            sex: pet.sex,
            breed: pet.breed,
            birth_date: pet.birth_date,
            birth_date_approximate: pet.birth_date_approximate,
            color: pet.color,
            allergies: next.length ? next.join(", ") : null,
            notes: pet.notes,
          },
        }),
      ),
    onSuccess: async () => {
      setText("");
      await queryClient.invalidateQueries({ queryKey: PETS });
    },
  });

  const add = (value: string) => {
    const clean = value.trim();
    if (!clean || list.some((a) => a.toLowerCase() === clean.toLowerCase())) return;
    save.mutate([...list, clean]);
  };

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className={cn(
        "grid gap-3 rounded-3xl border p-4",
        has ? "border-destructive/40 bg-destructive/5" : "border-dashed bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert
          className={cn("size-5", has ? "text-destructive" : "text-muted-foreground")}
          aria-hidden
        />
        <h2 id={`${inputId}-title`} className="text-base font-semibold">
          {has ? "Alergias" : "Sin alergias registradas"}
        </h2>
        {has ? (
          <ul className="flex flex-wrap gap-2" aria-label="Alergias registradas">
            {list.map((allergy) => (
              <li
                key={allergy}
                className="flex items-center gap-1 rounded-full bg-destructive px-3 py-1 text-sm font-semibold text-white"
              >
                {allergy}
                {canManage ? (
                  <button
                    type="button"
                    aria-label={`Quitar ${allergy}`}
                    disabled={save.isPending}
                    onClick={() => save.mutate(list.filter((a) => a !== allergy))}
                    className="-mr-1 rounded-full p-0.5 hover:bg-white/20"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {save.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(save.error)}</AlertDescription>
        </Alert>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex min-w-64 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add(text);
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              Agregar alergia
            </label>
            <Input
              id={inputId}
              placeholder="Agregar alergia (p. ej. amoxicilina)"
              value={text}
              maxLength={100}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" disabled={save.isPending || !text.trim()}>
              <Plus aria-hidden /> Agregar
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5" aria-label="Alergias comunes">
            {COMMON.filter((c) => !list.some((a) => a.toLowerCase() === c.toLowerCase())).map(
              (common) => (
                <Button
                  key={common}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => add(common)}
                >
                  + {common}
                </Button>
              ),
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
