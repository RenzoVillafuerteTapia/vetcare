import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useSessionManager } from "@/features/auth/session-context";
import { errorMessage, unwrap } from "@/lib/api-error";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

import {
  DOCUMENT_LABELS,
  GUARDIAN_LABELS,
  PERMISSION_LABELS,
  type Guardian,
  type GuardianKind,
  type Pet,
} from "./labels";
import { CLIENTS, petKey } from "./queries";

type Permissions = Guardian["permissions"];
const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as (keyof Permissions)[];
const ALL: Permissions = { can_pickup: true, can_book: true, can_view_clinical: true };
const DEFAULT_AUTHORIZED: Permissions = {
  can_pickup: true,
  can_book: false,
  can_view_clinical: false,
};

interface GuardianDialogProps {
  pet: Pet;
  /** Sin `editing` se agrega un responsable nuevo, que se elige buscando entre los clientes. */
  editing: Guardian | null;
  onClose: () => void;
}

export function GuardianDialog({ pet, editing, onClose }: GuardianDialogProps) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const kindId = useId();
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState<string | null>(editing?.client_id ?? null);
  const [kind, setKind] = useState<GuardianKind>(editing?.kind ?? "authorized");
  const [permissions, setPermissions] = useState<Permissions>(
    editing?.permissions ?? DEFAULT_AUTHORIZED,
  );
  const [missingClient, setMissingClient] = useState(false);
  const q = useDebounced(text.trim());

  const current = new Set(pet.guardians.map((guardian) => guardian.client_id));
  const candidates = useQuery({
    queryKey: [...CLIENTS, "search", q, 1],
    queryFn: () =>
      unwrap(api.GET("/api/v1/clients", { params: { query: { q, page: 1, page_size: 20 } } })),
    enabled: !editing && q.length >= 2,
  });
  const options = candidates.data?.items.filter((client) => !current.has(client.id)) ?? [];

  const save = useMutation({
    mutationFn: (guardianId: string) => {
      // Un dueño siempre tiene todos los permisos; la API ignora los que se envíen.
      const body = { kind, permissions: kind === "owner" ? ALL : permissions };
      return editing
        ? unwrap(
            api.PUT("/api/v1/pets/{pet_id}/guardians/{client_id}", {
              params: { path: { pet_id: pet.id, client_id: guardianId } },
              body,
            }),
          )
        : unwrap(
            api.POST("/api/v1/pets/{pet_id}/guardians", {
              params: { path: { pet_id: pet.id } },
              body: { client_id: guardianId, ...body },
            }),
          );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(petKey(pet.id), updated);
      onClose();
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {editing ? `Permisos de ${editing.full_name}` : `Agregar responsable de ${pet.name}`}
        </DialogTitle>
        <DialogDescription>
          Un dueño decide todo sobre la mascota. Un responsable autorizado solo puede lo que se
          marque aquí.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setMissingClient(clientId === null);
          if (clientId !== null) save.mutate(clientId);
        }}
      >
        <div className="grid gap-5">
          {save.isError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertDescription>{errorMessage(save.error)}</AlertDescription>
            </Alert>
          ) : null}

          {editing ? null : (
            <div className="grid gap-2">
              <Input
                type="search"
                aria-label="Buscar cliente"
                placeholder="Busca al cliente por nombre o documento"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              {q.length < 2 ? (
                <p className="text-xs text-muted-foreground">
                  Escribe al menos 2 caracteres. El responsable debe estar registrado como cliente.
                </p>
              ) : candidates.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Buscando…
                </p>
              ) : candidates.isError ? (
                <p className="text-sm text-destructive">{errorMessage(candidates.error)}</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ningún cliente disponible coincide con «{q}».
                </p>
              ) : (
                <fieldset className="grid max-h-56 gap-2 overflow-y-auto">
                  <legend className="sr-only">Clientes encontrados</legend>
                  {options.map((client) => (
                    <label
                      key={client.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors hover:bg-accent/50",
                        clientId === client.id && "border-primary bg-secondary/60",
                      )}
                    >
                      <input
                        type="radio"
                        name="guardian-client"
                        className="size-4 accent-primary"
                        checked={clientId === client.id}
                        onChange={() => {
                          setClientId(client.id);
                          setMissingClient(false);
                        }}
                      />
                      <span className="grid">
                        <span className="font-semibold">{client.full_name}</span>
                        <span className="text-muted-foreground">
                          {DOCUMENT_LABELS[client.document_type]} {client.document_number}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {missingClient ? (
                <p role="alert" className="text-sm text-destructive">
                  Elige al cliente que será responsable.
                </p>
              ) : null}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor={kindId}>Tipo</Label>
            <Select
              id={kindId}
              value={kind}
              onChange={(event) => setKind(event.target.value as GuardianKind)}
            >
              <option value="authorized">{GUARDIAN_LABELS.authorized}</option>
              <option value="owner">{GUARDIAN_LABELS.owner}</option>
            </Select>
          </div>

          <fieldset className="grid gap-2" disabled={kind === "owner"}>
            <legend className="mb-2 text-sm font-semibold">Permisos</legend>
            {PERMISSION_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={kind === "owner" || permissions[key]}
                  onChange={(event) =>
                    setPermissions({ ...permissions, [key]: event.target.checked })
                  }
                />
                {PERMISSION_LABELS[key]}
              </label>
            ))}
            {kind === "owner" ? (
              <p className="text-xs text-muted-foreground">
                Un dueño siempre tiene todos los permisos.
              </p>
            ) : null}
          </fieldset>
        </div>
        <DialogFooter className="mt-8">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {editing ? "Guardar permisos" : "Agregar responsable"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
