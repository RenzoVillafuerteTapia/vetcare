import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { errorMessage, unwrap } from "@/lib/api-error";

import { HISTORY_LABELS, STATUS_LABELS, STATUS_STYLES, type Appointment } from "./labels";
import { APPOINTMENTS, RESOURCES } from "./queries";
import { SlotPicker } from "./slot-picker";
import { formatSlot, formatStamp, limaDay } from "./time";

type Transition = "confirm" | "check-in" | "complete" | "no-show";

const TRANSITION_PATHS = {
  confirm: "/api/v1/appointments/{appointment_id}/confirm",
  "check-in": "/api/v1/appointments/{appointment_id}/check-in",
  complete: "/api/v1/appointments/{appointment_id}/complete",
  "no-show": "/api/v1/appointments/{appointment_id}/no-show",
} as const;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{children}</dd>
    </div>
  );
}

interface AppointmentDialogProps {
  appointment: Appointment;
  /** La cita cambió: quien abre el diálogo guarda la versión nueva. */
  onChanged: (appointment: Appointment) => void;
}

/** Detalle de una cita con las acciones que su estado permite. */
export function AppointmentDialog({ appointment, onChanged }: AppointmentDialogProps) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const canManage = usePermission("appointments:manage");
  const canSeePets = usePermission("pets:read");
  const reasonId = useId();
  const [mode, setMode] = useState<"detail" | "cancel" | "reschedule">("detail");
  const [cancelReason, setCancelReason] = useState("");
  const [day, setDay] = useState(limaDay(appointment.start));
  const [start, setStart] = useState("");
  const [missingStart, setMissingStart] = useState(false);

  const resources = useQuery({
    queryKey: RESOURCES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/resources")),
  });
  const resourceNames = appointment.resource_ids
    .map((id) => resources.data?.find((resource) => resource.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const path = { appointment_id: appointment.id };
  const change = useMutation({
    mutationFn: (
      action: Transition | { cancel: string | null } | { reschedule: string },
    ): Promise<Appointment> => {
      if (typeof action === "string") {
        return unwrap(api.POST(TRANSITION_PATHS[action], { params: { path } }));
      }
      if ("cancel" in action) {
        return unwrap(
          api.POST("/api/v1/appointments/{appointment_id}/cancel", {
            params: { path },
            body: { reason: action.cancel },
          }),
        );
      }
      return unwrap(
        api.POST("/api/v1/appointments/{appointment_id}/reschedule", {
          params: { path },
          // Sin recursos fijados: la API asigna los que estén libres en el nuevo horario.
          body: { start: action.reschedule, resource_ids: [] },
        }),
      );
    },
    onSuccess: async (updated) => {
      onChanged(updated);
      setMode("detail");
      setStart("");
      await queryClient.invalidateQueries({ queryKey: APPOINTMENTS });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS }),
  });

  const busy = change.isPending;
  const act = (action: Transition) => (
    <Button
      key={action}
      disabled={busy}
      variant={action === "no-show" ? "outline" : "default"}
      onClick={() => change.mutate(action)}
    >
      {busy && change.variables === action ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : null}
      {
        {
          confirm: "Confirmar",
          "check-in": "Registrar llegada",
          complete: "Completar atención",
          "no-show": "No asistió",
        }[action]
      }
    </Button>
  );

  const { status } = appointment;
  const open = status === "requested" || status === "confirmed";

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {appointment.pet_name} · {appointment.service_name}
        </DialogTitle>
        <DialogDescription>{formatSlot(appointment.start, appointment.end)}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        {change.isError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>{errorMessage(change.error)}</AlertDescription>
          </Alert>
        ) : null}

        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Estado">
            <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>
          </Fact>
          <Fact label="Mascota">
            {canSeePets ? (
              <Link
                to={`/mascotas/${appointment.pet_id}`}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {appointment.pet_name}
              </Link>
            ) : (
              appointment.pet_name
            )}
          </Fact>
          <Fact label="Atiende">{resourceNames.length > 0 ? resourceNames.join(" · ") : "—"}</Fact>
          <Fact label="Origen">
            {appointment.channel === "client"
              ? "Solicitada desde la app"
              : "Agendada en la clínica"}
          </Fact>
          <Fact label="Motivo">{appointment.reason ?? "—"}</Fact>
          <Fact label="Notas internas">{appointment.notes ?? "—"}</Fact>
          {appointment.cancellation_reason ? (
            <Fact label="Motivo de la cancelación">{appointment.cancellation_reason}</Fact>
          ) : null}
        </dl>

        {mode === "cancel" ? (
          <form
            className="grid gap-4 rounded-2xl bg-sidebar p-4"
            onSubmit={(event) => {
              event.preventDefault();
              change.mutate({ cancel: cancelReason.trim() || null });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={reasonId}>Motivo de la cancelación (opcional)</Label>
              <Textarea
                id={reasonId}
                className="min-h-20"
                maxLength={300}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMode("detail")}>
                Volver
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                Cancelar la cita
              </Button>
            </div>
          </form>
        ) : null}

        {mode === "reschedule" ? (
          <form
            className="grid gap-4 rounded-2xl bg-sidebar p-4"
            onSubmit={(event) => {
              event.preventDefault();
              setMissingStart(start === "");
              if (start !== "") change.mutate({ reschedule: start });
            }}
          >
            <SlotPicker
              serviceTypeId={appointment.service_type_id}
              day={day}
              start={start}
              onDayChange={setDay}
              onStartChange={setStart}
              error={missingStart && start === "" ? "Elige una hora libre." : undefined}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMode("detail")}>
                Volver
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                Guardar el nuevo horario
              </Button>
            </div>
          </form>
        ) : null}

        {appointment.history && appointment.history.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Historial</h3>
            <ol aria-label="Historial de la cita" className="grid gap-1.5 text-sm">
              {appointment.history.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex flex-wrap gap-x-2">
                  <span className="text-muted-foreground">{formatStamp(entry.at)}</span>
                  <span>{HISTORY_LABELS[entry.action]}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      {mode === "detail" && canManage && (open || status === "checked_in") ? (
        <DialogFooter className="flex-wrap">
          {canManage && open ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setMode("cancel")}>
                Cancelar cita
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setMode("reschedule")}>
                Reprogramar
              </Button>
            </>
          ) : null}
          {canManage && status === "requested" ? act("confirm") : null}
          {canManage && status === "confirmed" ? [act("no-show"), act("check-in")] : null}
          {canManage && status === "checked_in" ? act("complete") : null}
        </DialogFooter>
      ) : null}
    </DialogContent>
  );
}
