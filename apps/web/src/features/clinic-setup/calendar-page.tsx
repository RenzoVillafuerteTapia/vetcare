import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionManager } from "@/features/auth/session-context";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { applyFieldErrors } from "@/lib/form-errors";

import { formatDay, type Calendar, type ScheduleEntry } from "./labels";
import { ErrorState, LoadingState } from "@/components/query-state";
import { normalizeSchedule, scheduleProblem } from "./schedule";
import { ScheduleEditor } from "./schedule-editor";

const CALENDAR = ["clinic", "calendar"] as const;

function OpeningHoursCard({ calendar }: { calendar: Calendar }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>(() =>
    normalizeSchedule(calendar.opening_hours),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT("/api/v1/clinic/calendar/opening-hours", { body: { opening_hours: schedule } }),
      ),
    onSuccess: (updated) => queryClient.setQueryData(CALENDAR, updated),
    onError: (error) => setProblem(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario de atención</CardTitle>
        <CardDescription>
          La agenda solo ofrece citas dentro de este horario. Las horas son de la sede
          (America/Lima).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const found = scheduleProblem(schedule);
            setProblem(found);
            if (!found) save.mutate();
          }}
        >
          <ScheduleEditor
            value={schedule}
            onChange={(value) => {
              setSchedule(value);
              setProblem(null);
              save.reset();
            }}
            error={problem}
            emptyLabel="Cerrado"
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {save.isSuccess ? (
              <span role="status" className="flex items-center gap-1.5 text-sm text-success">
                <Check className="size-4" aria-hidden />
                Horario guardado
              </span>
            ) : null}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              Guardar horario
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const holidaySchema = z.object({
  day: z.string().min(1, "Elige la fecha."),
  name: z.string().trim().min(2, "Ingresa el nombre del feriado.").max(100, "Máximo 100."),
});

type HolidayValues = z.infer<typeof holidaySchema>;

function HolidaysCard({ calendar }: { calendar: Calendar }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<HolidayValues>({
    resolver: zodResolver(holidaySchema),
    defaultValues: { day: "", name: "" },
  });

  const add = useMutation({
    mutationFn: (values: HolidayValues) =>
      unwrap(api.POST("/api/v1/clinic/calendar/holidays", { body: values })),
    onSuccess: (updated) => {
      queryClient.setQueryData(CALENDAR, updated);
      reset();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.problem.code === "holiday_exists") {
        setError("day", { message: errorMessage(error) });
      } else {
        applyFieldErrors(error, setError, ["day", "name"]);
      }
    },
  });

  const remove = useMutation({
    mutationFn: (day: string) =>
      unwrap(api.DELETE("/api/v1/clinic/calendar/holidays/{day}", { params: { path: { day } } })),
    onSuccess: (updated) => queryClient.setQueryData(CALENDAR, updated),
  });

  const generalError =
    add.error && Object.keys(errors).length === 0
      ? errorMessage(add.error)
      : remove.error
        ? errorMessage(remove.error)
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feriados</CardTitle>
        <CardDescription>Los feriados cierran la sede todo el día.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {generalError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>{generalError}</AlertDescription>
          </Alert>
        ) : null}
        {calendar.holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay feriados registrados.</p>
        ) : (
          <ul className="grid gap-2">
            {calendar.holidays.map((holiday) => (
              <li
                key={holiday.day}
                className="flex items-center justify-between gap-2 rounded-2xl bg-sidebar px-4 py-2 text-sm"
              >
                <span>
                  <span className="font-semibold">{holiday.name}</span>
                  <span className="text-muted-foreground"> · {formatDay(holiday.day)}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar el feriado ${holiday.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(holiday.day)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-4 sm:grid-cols-[11rem_1fr_auto] sm:items-start"
          noValidate
          onSubmit={handleSubmit((values) => add.mutate(values))}
        >
          <FormField label="Fecha" type="date" error={errors.day?.message} {...register("day")} />
          <FormField label="Nombre" error={errors.name?.message} {...register("name")} />
          <Button type="submit" variant="outline" className="sm:mt-6" disabled={add.isPending}>
            {add.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
            Agregar feriado
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function CalendarPage() {
  const { api } = useSessionManager();
  const calendar = useQuery({
    queryKey: CALENDAR,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/calendar")),
  });

  if (calendar.isPending) {
    return <LoadingState label="Cargando el calendario de la sede…" />;
  }
  if (calendar.isError) {
    return <ErrorState error={calendar.error} onRetry={() => void calendar.refetch()} />;
  }
  return (
    <div className="grid gap-6">
      <OpeningHoursCard calendar={calendar.data} />
      <HolidaysCard calendar={calendar.data} />
    </div>
  );
}
