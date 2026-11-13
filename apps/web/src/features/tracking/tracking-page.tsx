import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@vetcare/shared";
import { ArrowRight, Check, HandHeart, Megaphone, Radio, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { errorMessage, unwrap } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import { TRACKING, trackingBoardKey } from "./queries";

export type TrackedService = Schemas["TrackedServiceResponse"];

/** El tablero se refresca solo: varias personas avanzan etapas a la vez. */
export const BOARD_REFRESH_MS = 10_000;

const STATUS_LABELS: Record<TrackedService["status"], string> = {
  in_progress: "En curso",
  ready: "Lista para recoger",
  handed_over: "Entregada",
};

const TEMPLATE_LABELS: Record<TrackedService["template"], string> = {
  grooming: "Baño y peluquería",
  surgery: "Cirugía",
  general: "Atención",
};

const time = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Tablero del personal: cada mascota en atención, su etapa y sus acciones. */
export function TrackingPage() {
  const { api } = useSessionManager();
  const board = useQuery({
    queryKey: trackingBoardKey,
    queryFn: () => unwrap(api.GET("/api/v1/tracked-services")),
    refetchInterval: BOARD_REFRESH_MS,
  });

  const active = (board.data ?? []).filter((s) => s.status !== "handed_over");
  const delivered = (board.data ?? []).filter((s) => s.status === "handed_over");

  return (
    <>
      <PageHeader
        title="Seguimiento"
        description="Avanza las etapas y publica novedades: el dueño las ve en vivo en la app."
        actions={
          <Badge variant="soft">
            <Radio aria-hidden /> Se actualiza solo
          </Badge>
        }
      />
      {board.isPending ? (
        <LoadingState label="Cargando el tablero…" />
      ) : board.isError ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : active.length === 0 && delivered.length === 0 ? (
        <EmptyState title="No hay mascotas en atención">
          <p className="text-sm text-muted-foreground">
            Registra la llegada de una cita en la Agenda e inicia su seguimiento desde el detalle.
          </p>
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <section aria-label="En atención" className="grid gap-4 lg:grid-cols-2">
            {active.map((service) => (
              <TrackingCard key={service.id} service={service} />
            ))}
          </section>
          {delivered.length > 0 ? (
            <section aria-label="Entregadas hoy" className="grid gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Entregadas hoy</h2>
              <ul className="grid gap-2">
                {delivered.map((s) => (
                  <li key={s.id} className="rounded-2xl bg-sidebar px-4 py-3 text-sm">
                    <span className="font-semibold">{s.pet_name}</span> · {s.service_name}
                    {s.handed_over_at ? ` · ${time.format(new Date(s.handed_over_at))}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

function TrackingCard({ service }: { service: TrackedService }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const canAdvance = usePermission("tracking:advance");
  const canDischarge = usePermission("tracking:authorize_discharge");
  const canPublish = usePermission("tracking:publish_update");
  const canHandOver = usePermission("tracking:hand_over");
  const textId = useId();
  const [text, setText] = useState("");

  const path = { params: { path: { service_id: service.id } } };
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: TRACKING });
  };
  const advance = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/tracked-services/{service_id}/advance", {
          ...path,
          body: { from_stage: service.current_stage },
        }),
      ),
    onSettled: done,
  });
  const publish = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/tracked-services/{service_id}/updates", {
          ...path,
          body: { text: text.trim() },
        }),
      ),
    onSuccess: () => setText(""),
    onSettled: done,
  });
  const handOver = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/tracked-services/{service_id}/hand-over", path)),
    onSettled: done,
  });
  const error = advance.error ?? publish.error ?? handOver.error;
  const busy = advance.isPending || publish.isPending || handOver.isPending;
  const ready = service.status === "ready";
  const mayAdvance = canAdvance && (!service.next_is_discharge || canDischarge);

  return (
    <Card className={cn("grid gap-4 p-5", ready && "border-primary")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="text-lg font-medium">
            {service.pet_name} · {service.service_name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {TEMPLATE_LABELS[service.template]} · desde las{" "}
            {time.format(new Date(service.started_at))}
          </p>
        </div>
        <Badge variant={ready ? "soft" : "outline"}>{STATUS_LABELS[service.status]}</Badge>
      </div>

      <ol aria-label="Etapas" className="flex flex-wrap gap-1.5">
        {service.stages.map((stage) => (
          <li
            key={stage.code}
            aria-current={stage.state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
              stage.state === "done" && "bg-secondary text-secondary-foreground",
              stage.state === "current" && "bg-primary text-primary-foreground",
              stage.state === "pending" && "border text-muted-foreground",
            )}
          >
            {stage.state === "done" ? <Check className="size-3" aria-hidden /> : null}
            {stage.label}
            {stage.reached_at ? (
              <span className="font-normal opacity-80">
                {time.format(new Date(stage.reached_at))}
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {service.next_stage && mayAdvance ? (
          <Button disabled={busy} onClick={() => advance.mutate()}>
            {service.next_is_discharge ? <ShieldCheck aria-hidden /> : <ArrowRight aria-hidden />}
            {service.next_is_discharge ? "Autorizar el alta" : `Pasar a ${service.next_stage}`}
          </Button>
        ) : null}
        {service.next_stage && service.next_is_discharge && canAdvance && !canDischarge ? (
          <p className="text-sm text-muted-foreground">El alta la autoriza un veterinario.</p>
        ) : null}
        {ready && canHandOver ? (
          <Button disabled={busy} onClick={() => handOver.mutate()}>
            <HandHeart aria-hidden /> Entregar a quien la recoge
          </Button>
        ) : null}
      </div>

      {canPublish ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) publish.mutate();
          }}
        >
          <Label htmlFor={textId}>Avance para el dueño</Label>
          <Textarea
            id={textId}
            value={text}
            maxLength={500}
            rows={2}
            placeholder="Ej.: Ya terminamos el baño, ahora la estamos secando."
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Lo ve el dueño en la app. No incluyas diagnósticos.
            </p>
            <Button type="submit" variant="outline" disabled={busy || !text.trim()}>
              <Megaphone aria-hidden /> Publicar
            </Button>
          </div>
        </form>
      ) : null}

      {service.updates.length > 0 ? (
        <ul aria-label="Avances publicados" className="grid gap-2 border-t pt-3">
          {service.updates.map((update) => (
            <li key={update.id} className="text-sm">
              <span className="mr-2 text-xs font-semibold text-muted-foreground">
                {time.format(new Date(update.at))}
              </span>
              {update.text}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
