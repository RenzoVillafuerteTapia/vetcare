import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import "./agenda.css";

import FullCalendar, { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import esLocale from "@fullcalendar/react/locales/es";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronLeft, ChevronRight, LoaderCircle, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/query-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { KIND_LABELS, KINDS } from "@/features/clinic-setup/labels";
import { clientKey } from "@/features/customers/queries";
import { unwrap } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import { AppointmentDialog } from "./appointment-dialog";
import { BookDialog } from "./book-dialog";
import { CLOSED_STATUSES, STATUS_LABELS, STATUS_STYLES, type Appointment } from "./labels";
import { agendaKey, RESOURCES } from "./queries";
import { formatSlot, fromWall, limaTime, limaToday, toWall, wallNow } from "./time";

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin, classicThemePlugin];

const VIEWS = [
  { type: "timeGridDay", label: "Día" },
  { type: "timeGridWeek", label: "Semana" },
  { type: "dayGridMonth", label: "Mes" },
] as const;

/** Las fechas del calendario están en "UTC" con hora de pared de Lima (ver `time.ts`). */
const wallOf = (date: Date) => date.toISOString().slice(0, 19);

type Booking = { start?: string | undefined; day?: string | undefined };

export function AgendaPage() {
  const { api } = useSessionManager();
  const canManage = usePermission("appointments:manage");
  const controller = useCalendarController();
  const resourceId = useId();
  const closedId = useId();

  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [resource, setResource] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);

  const resources = useQuery({
    queryKey: RESOURCES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/resources")),
  });

  const agenda = useQuery({
    queryKey: agendaKey(range?.from ?? "", range?.to ?? "", resource || null),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/appointments", {
          params: {
            query: {
              from: range?.from ?? "",
              to: range?.to ?? "",
              ...(resource ? { resource_id: resource } : {}),
            },
          },
        }),
      ),
    enabled: range !== null,
    // Al cambiar de semana se conservan las citas visibles hasta que llegan las nuevas.
    placeholderData: keepPreviousData,
  });

  const appointments = useMemo(
    () =>
      (agenda.data ?? []).filter(
        (appointment) => showClosed || !CLOSED_STATUSES.includes(appointment.status),
      ),
    [agenda.data, showClosed],
  );
  // El responsable distingue a las mascotas con el mismo nombre. Cada ficha se pide una vez.
  const canSeePets = usePermission("pets:read");
  const clientIds = useMemo(
    () => [...new Set(appointments.map((appointment) => appointment.client_id))],
    [appointments],
  );
  const owners = useQueries({
    queries: clientIds.map((id) => ({
      queryKey: clientKey(id),
      queryFn: () =>
        unwrap(api.GET("/api/v1/clients/{client_id}", { params: { path: { client_id: id } } })),
      enabled: canSeePets,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const ownerNames = new Map(
    owners.flatMap((owner) => (owner.data ? [[owner.data.id, owner.data.full_name]] : [])),
  );
  const ownerKey = clientIds.map((id) => ownerNames.get(id) ?? "").join("|");

  const events = useMemo(
    () =>
      appointments.map((appointment) => ({
        id: appointment.id,
        title: `${appointment.pet_name} · ${appointment.service_name}`,
        start: toWall(appointment.start),
        end: toWall(appointment.end),
        extendedProps: { appointment, owner: ownerNames.get(appointment.client_id) },
      })),
    // ownerKey cambia cuando llega el nombre de algún responsable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appointments, ownerKey],
  );

  const view = controller.view;
  const buttons = controller.getButtonState();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Agenda"
          description="Citas de la sede en hora de Lima. Elige una cita para ver su detalle."
        />
        {canManage ? (
          <Button onClick={() => setBooking({})}>
            <Plus aria-hidden />
            Nueva cita
          </Button>
        ) : null}
      </div>

      {booked ? (
        <Alert variant="success">
          <CalendarCheck aria-hidden />
          <AlertDescription>
            Cita agendada para {booked.pet_name}: {formatSlot(booked.start, booked.end)}.
          </AlertDescription>
        </Alert>
      ) : null}
      {agenda.isError ? (
        <ErrorState error={agenda.error} onRetry={() => void agenda.refetch()} />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => controller.today()}>
            Hoy
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Anterior"
            disabled={buttons.prev?.isDisabled}
            onClick={() => controller.prev()}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Siguiente"
            disabled={buttons.next?.isDisabled}
            onClick={() => controller.next()}
          >
            <ChevronRight aria-hidden />
          </Button>
          <h2 aria-live="polite" className="ml-2 text-xl font-medium first-letter:uppercase">
            {view?.title}
          </h2>
          {agenda.isFetching ? (
            <LoaderCircle
              className="size-4 animate-spin text-muted-foreground"
              aria-label="Cargando citas"
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={resourceId}>Recurso</Label>
            <Select
              id={resourceId}
              className="h-9 min-w-52"
              value={resource}
              onChange={(event) => setResource(event.target.value)}
            >
              <option value="">Todos los recursos</option>
              {KINDS.map((kind) => {
                const ofKind = (resources.data ?? []).filter(
                  (item) => item.kind === kind && item.active,
                );
                return ofKind.length === 0 ? null : (
                  <optgroup key={kind} label={KIND_LABELS[kind]}>
                    {ofKind.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </div>
          <div role="group" aria-label="Vista" className="flex rounded-full border bg-card p-1">
            {VIEWS.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                aria-pressed={view?.type === type}
                className={cn(
                  "h-7 rounded-full px-4 text-sm font-semibold text-muted-foreground outline-none",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  view?.type === type && "bg-surface-strong text-surface-strong-foreground",
                )}
                onClick={() => controller.changeView(type)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="agenda-calendar overflow-hidden rounded-3xl border bg-card">
        <FullCalendar
          plugins={PLUGINS}
          controller={controller}
          locale={esLocale}
          timeZone="UTC"
          now={() => wallNow()}
          initialView="timeGridWeek"
          headerToolbar={false}
          firstDay={1}
          height={680}
          allDaySlot={false}
          nowIndicator
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          scrollTime="08:00:00"
          slotDuration="00:30:00"
          dayMaxEvents={4}
          eventInteractive
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          events={events}
          eventContent={(info) => {
            const { appointment, owner } = info.event.extendedProps as {
              appointment: Appointment;
              owner?: string;
            };
            // Primero la mascota y su responsable: en una columna angosta es lo que cabe, y la
            // hora ya la da la posición en la grilla.
            return (
              <div
                className="truncate px-1.5 py-0.5 text-xs leading-tight"
                title={[
                  `${limaTime(appointment.start)} – ${limaTime(appointment.end)}`,
                  info.event.title,
                  owner,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <span>{info.event.title}</span>
                {owner ? <span className="font-normal"> · {owner}</span> : null}
              </div>
            );
          }}
          eventClass={(info) => {
            const { appointment } = info.event.extendedProps as { appointment: Appointment };
            return cn("agenda-event", STATUS_STYLES[appointment.status]);
          }}
          datesSet={(info) =>
            setRange({ from: fromWall(wallOf(info.start)), to: fromWall(wallOf(info.end)) })
          }
          eventClick={(info) => {
            const { appointment } = info.event.extendedProps as { appointment: Appointment };
            setSelected(appointment);
          }}
          dateClick={(info) => {
            if (!canManage) return;
            const wall = wallOf(info.date);
            if (wall.slice(0, 10) < limaToday()) return;
            setBooking(info.allDay ? { day: wall.slice(0, 10) } : { start: fromWall(wall) });
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <ul aria-label="Estados" className="flex flex-wrap gap-2">
          {(["requested", "confirmed", "checked_in", "completed"] as const).map((status) => (
            <li
              key={status}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                STATUS_STYLES[status],
              )}
            >
              {STATUS_LABELS[status]}
            </li>
          ))}
        </ul>
        <label htmlFor={closedId} className="flex cursor-pointer items-center gap-3">
          <input
            id={closedId}
            type="checkbox"
            className="size-4 accent-primary"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
          />
          Mostrar canceladas e inasistencias
        </label>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => (open ? null : setSelected(null))}>
        {selected ? (
          <AppointmentDialog key={selected.id} appointment={selected} onChanged={setSelected} />
        ) : null}
      </Dialog>

      <Dialog open={booking !== null} onOpenChange={(open) => (open ? null : setBooking(null))}>
        {booking ? (
          <BookDialog
            initialStart={booking.start}
            initialDay={booking.day}
            onClose={() => setBooking(null)}
            onBooked={(appointment) => {
              setBooking(null);
              setBooked(appointment);
              controller.gotoDate(toWall(appointment.start));
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
