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
import { Textarea } from "@/components/ui/textarea";
import { useSessionManager } from "@/features/auth/session-context";
import { formatDuration, KIND_LABELS, type ResourceKind } from "@/features/clinic-setup/labels";
import { DOCUMENT_LABELS, type Client } from "@/features/customers/labels";
import { clientPetsKey, CLIENTS } from "@/features/customers/queries";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

import type { Appointment } from "./labels";
import { APPOINTMENTS, RESOURCES, SERVICE_TYPES } from "./queries";
import { SlotPicker } from "./slot-picker";
import { limaDay, limaToday } from "./time";

interface BookDialogProps {
  /** Instante sugerido al abrir desde un espacio del calendario. */
  initialStart?: string | undefined;
  /** Día sugerido (`2026-11-12`) al abrir desde la vista de mes. */
  initialDay?: string | undefined;
  onBooked: (appointment: Appointment) => void;
  onClose: () => void;
}

type Problems = Partial<Record<"client" | "pet" | "service" | "start", string>>;

/** Agenda una cita confirmada: cliente y mascota, servicio, horario libre y recursos. */
export function BookDialog({ initialStart, initialDay, onBooked, onClose }: BookDialogProps) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const petId = useId();
  const serviceId = useId();
  const reasonId = useId();
  const notesId = useId();
  // La misma clave en cada reintento: si la respuesta se pierde, no se duplica la cita.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [text, setText] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [pet, setPet] = useState("");
  const [service, setService] = useState("");
  const [day, setDay] = useState(
    initialStart ? limaDay(initialStart) : (initialDay ?? limaToday()),
  );
  const [start, setStart] = useState(initialStart ?? "");
  const [preferred, setPreferred] = useState<Partial<Record<ResourceKind, string>>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [problems, setProblems] = useState<Problems>({});
  const q = useDebounced(text.trim());

  const candidates = useQuery({
    queryKey: [...CLIENTS, "search", q, 1],
    queryFn: () =>
      unwrap(api.GET("/api/v1/clients", { params: { query: { q, page: 1, page_size: 20 } } })),
    enabled: client === null && q.length >= 2,
  });
  const pets = useQuery({
    queryKey: clientPetsKey(client?.id ?? ""),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/clients/{client_id}/pets", {
          params: { path: { client_id: client?.id ?? "" } },
        }),
      ),
    enabled: client !== null,
  });
  const serviceTypes = useQuery({
    queryKey: SERVICE_TYPES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/service-types")),
  });
  const resources = useQuery({
    queryKey: RESOURCES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/resources")),
  });

  const activePets = pets.data?.filter((p) => p.status === "active") ?? [];
  const services = serviceTypes.data?.filter((s) => s.active) ?? [];
  const chosenService = services.find((s) => s.id === service);
  const kinds = [...new Set(chosenService?.required_resources ?? [])];

  const book = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/appointments", {
          params: { header: { "Idempotency-Key": idempotencyKey } },
          body: {
            pet_id: pet,
            service_type_id: service,
            start,
            client_id: client?.id ?? null,
            resource_ids: kinds.flatMap((kind) => preferred[kind] || []),
            reason: reason.trim() || null,
            notes: notes.trim() || null,
          },
        }),
      ),
    onSuccess: async (appointment) => {
      await queryClient.invalidateQueries({ queryKey: APPOINTMENTS });
      onBooked(appointment);
    },
    onError: async (error) => {
      // El horario se ocupó mientras se llenaba el formulario: se vuelven a pedir los libres.
      if (error instanceof ApiError && error.problem.code === "slot_unavailable") {
        setStart("");
        await queryClient.invalidateQueries({ queryKey: APPOINTMENTS });
      }
    },
  });

  const submit = () => {
    const found: Problems = {
      ...(client ? {} : { client: "Busca y elige al cliente." }),
      ...(pet ? {} : { pet: "Elige la mascota." }),
      ...(service ? {} : { service: "Elige el servicio." }),
      ...(start ? {} : { start: "Elige una hora libre." }),
    };
    setProblems(found);
    if (Object.keys(found).length === 0) book.mutate();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nueva cita</DialogTitle>
        <DialogDescription>
          Queda confirmada al guardarla. Solo se ofrecen los horarios que están libres.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-5">
          {book.isError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertDescription>{errorMessage(book.error)}</AlertDescription>
            </Alert>
          ) : null}

          {client ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-sidebar px-4 py-3">
              <div className="grid gap-0.5 text-sm">
                <span className="text-xs font-semibold text-muted-foreground">Cliente</span>
                <span className="font-semibold">{client.full_name}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setClient(null);
                  setPet("");
                }}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor={`${petId}-client`}>Cliente</Label>
              <Input
                id={`${petId}-client`}
                type="search"
                placeholder="Nombre, documento, correo o teléfono"
                autoComplete="off"
                value={text}
                aria-invalid={problems.client ? true : undefined}
                onChange={(event) => setText(event.target.value)}
              />
              {q.length >= 2 && candidates.isSuccess ? (
                candidates.data.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ningún cliente coincide con “{q}”.
                  </p>
                ) : (
                  <ul
                    aria-label="Clientes encontrados"
                    className="grid max-h-44 gap-1 overflow-y-auto"
                  >
                    {candidates.data.items.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          className={cn(
                            "grid w-full gap-0.5 rounded-2xl px-4 py-2 text-left text-sm outline-none",
                            "hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          )}
                          onClick={() => {
                            setClient(candidate);
                            setProblems((current) => ({ ...current, client: undefined }));
                          }}
                        >
                          <span className="font-semibold">{candidate.full_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {DOCUMENT_LABELS[candidate.document_type]} {candidate.document_number}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
              {problems.client ? (
                <p className="text-sm text-destructive">{problems.client}</p>
              ) : null}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={petId}>Mascota</Label>
              <Select
                id={petId}
                value={pet}
                disabled={!client || activePets.length === 0}
                aria-invalid={problems.pet ? true : undefined}
                onChange={(event) => setPet(event.target.value)}
              >
                <option value="">Elige una mascota</option>
                {activePets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {problems.pet ? (
                <p className="text-sm text-destructive">{problems.pet}</p>
              ) : client && pets.isSuccess && activePets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Este cliente no tiene mascotas activas. Regístrala desde su ficha.
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor={serviceId}>Servicio</Label>
              <Select
                id={serviceId}
                value={service}
                aria-invalid={problems.service ? true : undefined}
                onChange={(event) => {
                  setService(event.target.value);
                  setStart("");
                  setPreferred({});
                }}
              >
                <option value="">Elige un servicio</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatDuration(s.duration_minutes)}
                  </option>
                ))}
              </Select>
              {problems.service ? (
                <p className="text-sm text-destructive">{problems.service}</p>
              ) : null}
            </div>
          </div>

          <SlotPicker
            serviceTypeId={service || null}
            day={day}
            start={start}
            onDayChange={setDay}
            onStartChange={setStart}
            error={start ? undefined : problems.start}
          />

          {kinds.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {kinds.map((kind) => (
                <div key={kind} className="grid gap-2">
                  <Label htmlFor={`${serviceId}-${kind}`}>{KIND_LABELS[kind]} (opcional)</Label>
                  <Select
                    id={`${serviceId}-${kind}`}
                    value={preferred[kind] ?? ""}
                    onChange={(event) =>
                      setPreferred((current) => ({ ...current, [kind]: event.target.value }))
                    }
                  >
                    <option value="">Cualquiera disponible</option>
                    {(resources.data ?? [])
                      .filter((resource) => resource.kind === kind && resource.active)
                      .map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name}
                        </option>
                      ))}
                  </Select>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={reasonId}>Motivo (opcional)</Label>
            <Textarea
              id={reasonId}
              className="min-h-20"
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={notesId}>Notas internas (opcional)</Label>
            <Textarea
              id={notesId}
              className="min-h-20"
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="mt-8">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={book.isPending}>
            {book.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            Agendar cita
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
