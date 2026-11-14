import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarClock } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import {
  ANY_PROFESSIONAL,
  BackLink,
  Loading,
  ProfessionalPicker,
  SlotPicker,
  useProfessionals,
} from "@/components/appointments";
import { Body, Button, Heading, Notice, Screen } from "@/components/ui";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { appointmentKey, ME } from "@/lib/queries";
import { formatSlot, limaDay } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { spacing } from "@/theme/tokens";

export default function RescheduleScreen() {
  const { appointmentId = "" } = useLocalSearchParams<{ appointmentId: string }>();
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [day, setDay] = useState(() => limaDay(Date.now()));
  const [start, setStart] = useState("");
  const [missing, setMissing] = useState(false);
  // `null`: se mantiene el profesional de la cita.
  const [professional, setProfessional] = useState<string | null>(null);

  const appointment = useQuery({
    queryKey: appointmentKey(appointmentId),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/appointments/{appointment_id}", {
          params: { path: { appointment_id: appointmentId } },
        }),
      ),
  });

  const professionals = useProfessionals(appointment.data?.service_type_id ?? null);
  const current = appointment.data?.resource_ids.find((id) =>
    professionals.data?.some((p) => p.id === id),
  );
  const chosenProfessional = professional ?? current ?? ANY_PROFESSIONAL;

  const reschedule = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/appointments/{appointment_id}/reschedule", {
          params: { path: { appointment_id: appointmentId } },
          body: {
            start,
            resource_ids: chosenProfessional === ANY_PROFESSIONAL ? [] : [chosenProfessional],
          },
        }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(appointmentKey(appointmentId), updated);
      await queryClient.invalidateQueries({ queryKey: ME });
      router.replace(`/citas/${appointmentId}?aviso=reprogramada`);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.problem.code === "slot_unavailable") {
        setStart("");
        await queryClient.invalidateQueries({ queryKey: ["availability"] });
      }
    },
  });

  return (
    <Screen tabs>
      <BackLink />
      <View style={{ gap: spacing(1.5) }}>
        <Heading>Reprogramar</Heading>
        {appointment.data ? (
          <Body muted>
            {appointment.data.pet_name} · {appointment.data.service_name}. Ahora:{" "}
            {formatSlot(appointment.data.start, appointment.data.end)}.
          </Body>
        ) : null}
      </View>

      {appointment.isPending ? (
        <Loading label="Cargando la cita…" />
      ) : appointment.isError ? (
        <Notice tone="error">{errorMessage(appointment.error)}</Notice>
      ) : (
        <>
          {reschedule.isError ? (
            <Notice tone="error">{errorMessage(reschedule.error)}</Notice>
          ) : null}
          <Body muted>
            El nuevo horario queda por confirmar hasta que la veterinaria lo acepte.
          </Body>
          <ProfessionalPicker
            serviceTypeId={appointment.data.service_type_id}
            value={chosenProfessional}
            onChange={(value) => {
              setProfessional(value);
              setStart("");
            }}
          />
          <SlotPicker
            serviceTypeId={appointment.data.service_type_id}
            professionalId={chosenProfessional}
            day={day}
            start={start}
            onDayChange={setDay}
            onStartChange={setStart}
            error={missing && !start ? "Elige una hora libre." : undefined}
          />
          <Button
            label="Solicitar el nuevo horario"
            icon={CalendarClock}
            loading={reschedule.isPending}
            onPress={() => {
              setMissing(!start);
              if (start) reschedule.mutate();
            }}
          />
        </>
      )}
    </Screen>
  );
}
