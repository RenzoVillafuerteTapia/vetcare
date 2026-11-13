import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { CatalogCard, CatalogGrid } from "@/components/catalog-card";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { unwrap } from "@/lib/api-error";
import { useDebounced } from "@/lib/use-debounced";

import { ClientFormDialog } from "./client-form-dialog";
import { DOCUMENT_LABELS } from "./labels";
import { CLIENTS } from "./queries";

// Dos filas de seis tarjetas: caben en una pantalla de laptop sin desplazarse.
const PAGE_SIZE = 12;

export function ClientsPage() {
  const { api } = useSessionManager();
  const navigate = useNavigate();
  const canManage = usePermission("clients:manage");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(text.trim());

  const clients = useQuery({
    queryKey: [...CLIENTS, "search", q, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/clients", {
          params: { query: { ...(q ? { q } : {}), page, page_size: PAGE_SIZE } },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const pages = clients.data ? Math.max(1, Math.ceil(clients.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Clientes"
        description="Dueños y responsables de las mascotas. Desde la ficha se registran sus mascotas."
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Nuevo cliente
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Buscar clientes"
            placeholder="Nombre, documento, correo o teléfono"
            className="pl-11"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {clients.isPending ? (
        <LoadingState label="Cargando clientes…" />
      ) : clients.isError ? (
        <ErrorState error={clients.error} onRetry={() => void clients.refetch()} />
      ) : clients.data.items.length === 0 ? (
        q ? (
          <EmptyState title="Sin resultados">
            <p className="text-muted-foreground">Ningún cliente coincide con «{q}».</p>
          </EmptyState>
        ) : (
          <EmptyState title="Todavía no hay clientes">
            <p className="text-muted-foreground">
              Registra al primero para poder agregar sus mascotas.
            </p>
          </EmptyState>
        )
      ) : (
        <>
          <CatalogGrid label="Clientes">
            {clients.data.items.map((client) => (
              <li key={client.id}>
                <CatalogCard
                  to={`/clientes/${client.id}`}
                  media={<Initials name={client.full_name} />}
                  corner={client.has_account ? { label: "Usa la app", tone: "green" } : null}
                  chips={[
                    {
                      label: `${DOCUMENT_LABELS[client.document_type]} ${client.document_number}`,
                      tone: "blue",
                    },
                    ...(client.email ? [{ label: "Con correo", tone: "green" as const }] : []),
                    ...(client.has_account ? [] : [{ label: "Sin app", tone: "gray" as const }]),
                  ]}
                  title={client.full_name}
                  highlight={client.phone}
                  footer={client.email ?? client.address ?? "Sin correo registrado"}
                  footerTone={client.email ? "ok" : "muted"}
                />
              </li>
            ))}
          </CatalogGrid>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span role="status">
              {clients.data.total === 1 ? "1 cliente" : `${clients.data.total} clientes`}
              {pages > 1 ? ` · página ${page} de ${pages}` : ""}
            </span>
            {pages > 1 ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft aria-hidden />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? (
          <ClientFormDialog
            editing={null}
            onClose={() => setCreating(false)}
            onSaved={(client) => void navigate(`/clientes/${client.id}`)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

const AVATAR_TONES = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-800",
  "bg-violet-100 text-violet-800",
];

/** Iniciales grandes en un círculo de color estable por persona. */
function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  const tone =
    AVATAR_TONES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={`flex size-16 items-center justify-center rounded-full font-display text-xl font-medium ${tone}`}
    >
      {initials}
    </span>
  );
}
