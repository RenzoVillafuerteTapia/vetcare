import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { unwrap } from "@/lib/api-error";
import { useDebounced } from "@/lib/use-debounced";

import { ClientFormDialog } from "./client-form-dialog";
import { DOCUMENT_LABELS } from "./labels";
import { CLIENTS } from "./queries";

const PAGE_SIZE = 20;

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
    <div className="max-w-5xl">
      <PageHeader
        title="Clientes"
        description="Dueños y responsables de las mascotas. Desde la ficha de cada cliente se registran sus mascotas."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
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
        {canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Nuevo cliente
          </Button>
        ) : null}
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
          <ul className="grid gap-3" aria-label="Clientes">
            {clients.data.items.map((client) => (
              <li key={client.id}>
                <Link
                  to={`/clientes/${client.id}`}
                  className="grid gap-1 rounded-3xl border border-border/70 bg-card p-5 transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <span className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-medium">{client.full_name}</span>
                      {client.has_account ? (
                        <Badge variant="soft">Con cuenta en la app</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {DOCUMENT_LABELS[client.document_type]} {client.document_number} ·{" "}
                      {client.phone}
                      {client.email ? ` · ${client.email}` : ""}
                    </span>
                  </span>
                  <ChevronRight
                    className="hidden size-5 text-muted-foreground sm:block"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
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
