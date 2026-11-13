import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { WEEKDAYS, type ScheduleEntry } from "./labels";

interface ScheduleEditorProps {
  value: ScheduleEntry[];
  onChange: (value: ScheduleEntry[]) => void;
  error?: string | null | undefined;
  /** Texto para los días sin franjas: "Cerrado" en la sede, "No atiende" en un recurso. */
  emptyLabel: string;
}

/** Franjas por día de la semana, en hora de la sede. Un día sin franjas no atiende. */
export function ScheduleEditor({ value, onChange, error, emptyLabel }: ScheduleEditorProps) {
  const update = (index: number, patch: Partial<ScheduleEntry>) =>
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  return (
    <fieldset className="grid gap-3" aria-describedby={error ? "schedule-error" : undefined}>
      <legend className="sr-only">Horario semanal</legend>
      <ul className="grid gap-2">
        {WEEKDAYS.map((day, weekday) => {
          const ranges = value
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.weekday === weekday);
          return (
            <li
              key={day}
              className="grid gap-2 rounded-2xl bg-sidebar p-3 sm:grid-cols-[6.5rem_1fr_auto] sm:items-start"
            >
              <span className="pt-2.5 text-sm font-semibold">{day}</span>
              <div className="grid gap-2">
                {ranges.length === 0 ? (
                  <span className="pt-2.5 text-sm text-muted-foreground">{emptyLabel}</span>
                ) : null}
                {ranges.map(({ entry, index }, position) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="time"
                      step={300}
                      aria-label={`${day}, franja ${position + 1}, inicio`}
                      value={entry.start}
                      onChange={(event) => update(index, { start: event.target.value })}
                      className="w-32"
                    />
                    <span aria-hidden className="text-muted-foreground">
                      a
                    </span>
                    <Input
                      type="time"
                      step={300}
                      aria-label={`${day}, franja ${position + 1}, fin`}
                      value={entry.end}
                      onChange={(event) => update(index, { end: event.target.value })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar la franja ${position + 1} del ${day.toLowerCase()}`}
                      onClick={() => onChange(value.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Agregar franja el ${day.toLowerCase()}`}
                onClick={() =>
                  onChange([
                    ...value,
                    {
                      weekday: weekday as ScheduleEntry["weekday"],
                      start: ranges.at(-1)?.entry.end || "09:00",
                      end: "",
                    },
                  ])
                }
              >
                <Plus aria-hidden />
                Franja
              </Button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p id="schedule-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
