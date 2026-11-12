import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, MailCheck, Pencil, Plus, Send } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { unwrap } from "@/lib/api-error";

import { ClientFormDialog } from "./client-form-dialog";
import {
  DOCUMENT_LABELS,
  formatAge,
  GUARDIAN_LABELS,
  SPECIES_LABELS,
  STATUS_LABELS,
  type Client,
} from "./labels";
import { PetFormDialog } from "./pet-form-dialog";
import { PetPhoto } from "./pet-photo";
import { clientKey, clientPetsKey, CLIENTS } from "./queries";

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

function AppAccess({ client }: { client: Client }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const canManage = usePermission("clients:manage");

  const invite = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/clients/{client_id}/invitation", {
          params: { path: { client_id: client.id } },
        }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(clientKey(client.id), updated);
      await queryClient.invalidateQueries({ queryKey: CLIENTS });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acceso a la app</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {invite.isSuccess ? (
          <Alert variant="success">
            <MailCheck aria-hidden />
            <AlertTitle>Invitación enviada a {client.email}</AlertTitle>
            <AlertDescription>
              El cliente recibirá un enlace para activar su cuenta y elegir su contraseña.
            </AlertDescription>
          </Alert>
        ) : client.has_account ? (
          <p className="flex items-center gap-2">
            <Badge variant="soft">Con cuenta en la app</Badge>
            <span className="text-muted-foreground">
              Ya fue invitado con el correo {client.email}.
            </span>
          </p>
        ) : client.email ? (
          <p className="text-sm text-muted-foreground">
            Todavía no tiene cuenta. La invitación llega a {client.email}.
          </p>
        ) : (
          <p className="text-muted-foreground">Registra su correo para poder invitarlo a la app.</p>
        )}
        {invite.isError ? <ErrorState error={invite.error} /> : null}
        {canManage && !client.has_account && !invite.isSuccess ? (
          <Button
            className="w-fit"
            variant="outline"
            disabled={!client.email || invite.isPending}
            onClick={() => invite.mutate()}
          >
            <Send aria-hidden />
            Invitar a la app
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClientPets({ client }: { client: Client }) {
  const { api } = useSessionManager();
  const navigate = useNavigate();
  const canManagePets = usePermission("pets:manage");
  const [creating, setCreating] = useState(false);

  const pets = useQuery({
    queryKey: clientPetsKey(client.id),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/clients/{client_id}/pets", {
          params: { path: { client_id: client.id } },
        }),
      ),
  });

  return (
    <section aria-labelledby="mascotas" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mascotas" className="text-xl font-medium">
          Mascotas
        </h2>
        {canManagePets ? (
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Nueva mascota
          </Button>
        ) : null}
      </div>

      {pets.isPending ? (
        <LoadingState label="Cargando mascotas…" />
      ) : pets.isError ? (
        <ErrorState error={pets.error} onRetry={() => void pets.refetch()} />
      ) : pets.data.length === 0 ? (
        <EmptyState title="Sin mascotas registradas">
          <p className="text-sm text-muted-foreground">
            Registra a su primera mascota para poder agendarle citas.
          </p>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Mascotas del cliente">
          {pets.data.map((pet) => {
            const guardianship = pet.guardians.find((g) => g.client_id === client.id);
            return (
              <li key={pet.id}>
                <Link
                  to={`/mascotas/${pet.id}`}
                  className="flex items-center gap-4 rounded-3xl border border-border/70 bg-card p-5 transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <PetPhoto pet={pet} className="size-11 rounded-2xl" />
                  <span className="grid flex-1 gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-medium">{pet.name}</span>
                      {pet.status === "active" ? null : <Badge>{STATUS_LABELS[pet.status]}</Badge>}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {SPECIES_LABELS[pet.species]}
                      {pet.breed ? ` · ${pet.breed}` : ""}
                      {pet.birth_date ? ` · ${formatAge(pet.birth_date)}` : ""}
                    </span>
                    {guardianship ? (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {GUARDIAN_LABELS[guardianship.kind]}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? (
          <PetFormDialog
            ownerId={client.id}
            ownerName={client.full_name}
            onClose={() => setCreating(false)}
            onSaved={(pet) => void navigate(`/mascotas/${pet.id}`)}
          />
        ) : null}
      </Dialog>
    </section>
  );
}

export function ClientPage() {
  const { clientId = "" } = useParams();
  const { api } = useSessionManager();
  const canManage = usePermission("clients:manage");
  const [editing, setEditing] = useState(false);

  const client = useQuery({
    queryKey: clientKey(clientId),
    queryFn: () =>
      unwrap(api.GET("/api/v1/clients/{client_id}", { params: { path: { client_id: clientId } } })),
  });

  return (
    <div className="grid max-w-6xl gap-5">
      <Link
        to="/clientes"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Clientes
      </Link>

      {client.isPending ? (
        <LoadingState label="Cargando la ficha del cliente…" />
      ) : client.isError ? (
        <ErrorState error={client.error} onRetry={() => void client.refetch()} />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <h1 className="text-2xl font-medium md:text-3xl">{client.data.full_name}</h1>
              <p className="text-sm text-muted-foreground">
                {DOCUMENT_LABELS[client.data.document_type]} {client.data.document_number}
              </p>
            </div>
            {canManage ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Editar cliente
              </Button>
            ) : null}
          </header>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Datos de contacto</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Fact label="Teléfono" value={client.data.phone} />
                  <Fact label="Correo" value={client.data.email} />
                  <Fact label="Dirección" value={client.data.address} />
                  <Fact label="Notas" value={client.data.notes} />
                </dl>
              </CardContent>
            </Card>
            <AppAccess client={client.data} />
          </div>

          <ClientPets client={client.data} />

          <Dialog open={editing} onOpenChange={setEditing}>
            {editing ? (
              <ClientFormDialog
                editing={client.data}
                onClose={() => setEditing(false)}
                onSaved={() => setEditing(false)}
              />
            ) : null}
          </Dialog>
        </>
      )}
    </div>
  );
}
