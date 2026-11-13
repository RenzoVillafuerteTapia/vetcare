import { useQuery } from "@tanstack/react-query";
import { useEffect, useId } from "react";

import { FormField } from "@/components/form-field";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useSessionManager } from "@/features/auth/session-context";
import { errorMessage, unwrap } from "@/lib/api-error";

import { availabilityKey } from "./queries";
import { limaTime, limaToday } from "./time";

interface SlotPickerProps {
  serviceTypeId: string | null;
  day: string;
  /** Inicio elegido, como instante de la API; vacío si aún no se eligió. */
  start: string;
  onDayChange: (day: string) => void;
  onStartChange: (start: string) => void;
  error?: string | undefined;
}

/** Día y hora de una cita, entre los horarios libres que informa la API para ese servicio. */
export function SlotPicker({
  serviceTypeId,
  day,
  start,
  onDayChange,
  onStartChange,
  error,
}: SlotPickerProps) {
  const { api } = useSessionManager();
  const timeId = useId();

  const slots = useQuery({
    queryKey: availabilityKey(serviceTypeId ?? "", day),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/scheduling/availability", {
          params: { query: { service_type_id: serviceTypeId ?? "", date: day } },
        }),
      ),
    enabled: serviceTypeId !== null && day !== "",
    // La disponibilidad cambia con cada reserva: no se reutiliza una respuesta vieja.
    staleTime: 0,
  });

  const options = slots.data ?? [];
  // El mismo instante puede venir escrito con otra zona (p. ej. desde el calendario).
  const selected =
    start === ""
      ? ""
      : (options.find((slot) => Date.parse(slot.start) === Date.parse(start))?.start ?? "");
  // Un horario sugerido que resultó no estar libre se descarta, para no enviarlo.
  const stale = slots.isSuccess && start !== "" && selected === "";
  useEffect(() => {
    if (stale) onStartChange("");
  }, [stale, onStartChange]);

  const hint = !serviceTypeId
    ? "Elige primero el servicio."
    : slots.isPending
      ? "Buscando horarios libres…"
      : slots.isError
        ? errorMessage(slots.error)
        : options.length === 0
          ? "No hay horarios libres ese día. Prueba con otro."
          : null;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField
        label="Día"
        type="date"
        min={limaToday()}
        value={day}
        onChange={(event) => {
          onDayChange(event.target.value);
          onStartChange("");
        }}
      />
      <div className="grid gap-2">
        <Label htmlFor={timeId}>Hora</Label>
        <Select
          id={timeId}
          value={selected}
          disabled={options.length === 0}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onStartChange(event.target.value)}
        >
          <option value="">Elige una hora</option>
          {options.map((slot) => (
            <option key={slot.start} value={slot.start}>
              {limaTime(slot.start)} – {limaTime(slot.end)}
            </option>
          ))}
        </Select>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
