import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, LoaderCircle, PawPrint, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import type { Pet } from "./labels";
import { petKey, PETS } from "./queries";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** La URL firmada cambia en cada respuesta; lo que identifica a la foto es su ruta. */
const pathOf = (url: string | null) => url?.split("?")[0] ?? null;

type PetPhotoProps = { pet: Pick<Pet, "name" | "photo_url">; className?: string };

/** Foto de la mascota, o una huella si no tiene o si no se pudo cargar. */
export function PetPhoto({ pet, className }: PetPhotoProps) {
  const queryClient = useQueryClient();
  const [shown, setShown] = useState(pet.photo_url);
  const [failed, setFailed] = useState<string | null>(null);
  const retried = useRef<string | null>(null);

  // Mientras sea la misma foto y haya cargado, se conserva la URL ya descargada: cada respuesta
  // trae una firma nueva y no hace falta volver a bajar la imagen.
  if (pet.photo_url !== shown && (pathOf(pet.photo_url) !== pathOf(shown) || failed === shown)) {
    setShown(pet.photo_url);
  }

  if (!shown || failed === shown) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center bg-sidebar text-primary",
          className,
        )}
      >
        <PawPrint className="size-2/5" aria-hidden />
      </span>
    );
  }
  return (
    <img
      src={shown}
      alt={`Foto de ${pet.name}`}
      className={cn("shrink-0 bg-sidebar object-cover", className)}
      onLoad={() => {
        retried.current = null;
      }}
      onError={() => {
        setFailed(shown);
        // La firma dura 5 minutos: si venció, se pide una nueva, una sola vez por foto.
        if (retried.current !== pathOf(shown)) {
          retried.current = pathOf(shown);
          void queryClient.invalidateQueries({ queryKey: PETS });
        }
      }}
    />
  );
}

function fileProblem(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "Usa una imagen JPG, PNG o WebP.";
  if (file.size > MAX_BYTES) return "La imagen pesa más de 5 MB.";
  return null;
}

/** Foto del perfil con las acciones para subirla, cambiarla o quitarla (con `pets:manage`). */
export function PetPhotoEditor({ pet }: { pet: Pet }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const canManage = usePermission("pets:manage");
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const onSaved = async (updated: Pet) => {
    queryClient.setQueryData(petKey(pet.id), updated);
    await queryClient.invalidateQueries({ queryKey: PETS });
  };
  const onError = (error: unknown) => {
    const field = error instanceof ApiError ? error.problem.errors?.[0]?.message : undefined;
    setProblem(field ?? errorMessage(error));
  };

  const upload = useMutation({
    mutationFn: (file: File) =>
      unwrap(
        api.PUT("/api/v1/pets/{pet_id}/photo", {
          params: { path: { pet_id: pet.id } },
          // El contrato describe el archivo como texto binario; en el navegador es un File.
          body: { file: file as unknown as string },
          bodySerializer: (body) => {
            const form = new FormData();
            form.append("file", body.file);
            return form;
          },
        }),
      ),
    onSuccess: onSaved,
    onError,
  });

  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/api/v1/pets/{pet_id}/photo", { params: { path: { pet_id: pet.id } } })),
    onSuccess: onSaved,
    onError,
  });

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex items-center gap-4">
      <PetPhoto pet={pet} className="size-24 rounded-3xl" />
      {canManage ? (
        <div className="grid gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            aria-label="Archivo de la foto"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Permite volver a elegir el mismo archivo después de un error.
              event.target.value = "";
              if (!file) return;
              const invalid = fileProblem(file);
              setProblem(invalid);
              if (!invalid) upload.mutate(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {upload.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Camera aria-hidden />
              )}
              {pet.photo_url ? "Cambiar foto" : "Subir foto"}
            </Button>
            {pet.photo_url ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setProblem(null);
                  remove.mutate();
                }}
              >
                <Trash2 aria-hidden />
                Quitar foto
              </Button>
            ) : null}
          </div>
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">JPG, PNG o WebP de hasta 5 MB.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
