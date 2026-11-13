import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";

import { CatalogCard, CatalogGrid, type CatalogChip } from "@/components/catalog-card";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionManager } from "@/features/auth/session-context";
import { unwrap } from "@/lib/api-error";
import { useDebounced } from "@/lib/use-debounced";

import {
  SEX_LABELS,
  SPECIES,
  SPECIES_LABELS,
  STATUS_LABELS,
  type Pet,
  type Species,
} from "./labels";
import { PetPhoto } from "./pet-photo";
import { PETS } from "./queries";

// Dos filas de seis tarjetas: caben en una pantalla de laptop sin desplazarse.
const PAGE_SIZE = 12;

/** Edad aproximada: "8 meses", "3 años". */
function ageOf(birth: string | null, now: Date): string | null {
  if (!birth) return null;
  const [y = 0, m = 1, d = 1] = birth.split("-").map(Number);
  const months =
    (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) - (now.getDate() < d ? 1 : 0);
  if (months < 12) return `${Math.max(months, 0)} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "año" : "años"}`;
}

/** Todas las mascotas de la veterinaria, como un catálogo. */
export function PetsPage() {
  const { api } = useSessionManager();
  const [text, setText] = useState("");
  const [species, setSpecies] = useState<Species | null>(null);
  const [page, setPage] = useState(1);
  const [now] = useState(() => new Date());
  const q = useDebounced(text.trim());

  const pets = useQuery({
    queryKey: [...PETS, "search", q, species, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/pets", {
          params: {
            query: {
              ...(q ? { q } : {}),
              ...(species ? { species } : {}),
              page,
              page_size: PAGE_SIZE,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const pages = pets.data ? Math.max(1, Math.ceil(pets.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Mascotas"
        description="Todas las mascotas con su foto y sus responsables. Se registran desde la ficha del cliente."
      />

      <div className="mb-4 grid gap-3">
        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Buscar mascotas"
            placeholder="Nombre de la mascota o de su dueño"
            className="pl-11"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div role="group" aria-label="Especie" className="flex flex-wrap gap-2">
          {[null, ...SPECIES].map((s) => (
            <Button
              key={s ?? "todas"}
              size="sm"
              variant={species === s ? "default" : "outline"}
              aria-pressed={species === s}
              onClick={() => {
                setSpecies(s);
                setPage(1);
              }}
            >
              {s ? SPECIES_LABELS[s] : "Todas"}
            </Button>
          ))}
        </div>
      </div>

      {pets.isPending ? (
        <LoadingState label="Cargando mascotas…" />
      ) : pets.isError ? (
        <ErrorState error={pets.error} onRetry={() => void pets.refetch()} />
      ) : pets.data.items.length === 0 ? (
        <EmptyState title={q || species ? "Sin resultados" : "Todavía no hay mascotas"}>
          <p className="text-muted-foreground">
            {q || species
              ? "Ninguna mascota coincide con la búsqueda."
              : "Registra un cliente y, desde su ficha, sus mascotas."}
          </p>
        </EmptyState>
      ) : (
        <>
          <CatalogGrid label="Mascotas">
            {pets.data.items.map((pet) => (
              <li key={pet.id}>
                <PetCard pet={pet} now={now} />
              </li>
            ))}
          </CatalogGrid>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span role="status">
              {pets.data.total === 1 ? "1 mascota" : `${pets.data.total} mascotas`}
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
                  <ChevronLeft aria-hidden /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

function PetCard({ pet, now }: { pet: Pet; now: Date }) {
  const age = ageOf(pet.birth_date, now);
  const owners = pet.guardians.filter((g) => g.kind === "owner").map((g) => g.full_name);
  const chips: CatalogChip[] = [
    { label: SPECIES_LABELS[pet.species], tone: "green" },
    { label: SEX_LABELS[pet.sex], tone: "blue" },
    ...(age ? [{ label: age, tone: "pink" as const }] : []),
  ];
  return (
    <CatalogCard
      to={`/mascotas/${pet.id}`}
      media={<PetPhoto pet={pet} className="size-full rounded-none" />}
      corner={
        pet.status === "active"
          ? pet.allergies
            ? { label: "Alergias", tone: "red" }
            : null
          : { label: STATUS_LABELS[pet.status], tone: "dark" }
      }
      chips={chips}
      title={pet.name}
      highlight={pet.breed ?? SPECIES_LABELS[pet.species]}
      footer={owners.length ? `Dueño: ${owners.join(", ")}` : "Sin dueño registrado"}
      footerTone={owners.length ? "ok" : "warn"}
    />
  );
}
