import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Send } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { BackLink, ChoiceChips, Loading, SlotPicker } from "@/components/appointments";
import { Body, Button, Heading, Notice, Screen, TextField } from "@/components/ui";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { ME, MY_PETS, newIdempotencyKey, SERVICE_TYPES } from "@/lib/queries";
import { limaDay } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { spacing } from "@/theme/tokens";

type Problems = Partial<Record<"pet" | "service" | "start", string>>;

export default function RequestAppointmentScreen() {
  const { petId: initialPet } = useLocalSearchParams<{ petId?: string }>();
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const router = useRouter();
  // La misma clave en cada reintento: si la respuesta se pierde, no se duplica la solicitud.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const [pet, setPet] = useState(initialPet ?? "");
  const [service, setService] = useState("");
  const [day, setDay] = useState(() => limaDay(Date.now()));
  const [start, setStart] = useState("");
  const [reason, setReason] = useState("");
  const [problems, setProblems] = useState<Problems>({});

  const pets = useQuery({
    queryKey: MY_PETS,
    queryFn: () => unwrap(api.GET("/api/v1/me/pets")),
  });
  const services = useQuery({
    queryKey: SERVICE_TYPES,
    queryFn: () => unwrap(api.GET("/api/v1/clinic/service-types")),
  });

  const request = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/appointments", {
          params: { header: { "Idempotency-Key": idempotencyKey } },
          body: { pet_id: pet, service_type_id: service, start, reason: reason.trim() || null },
        }),
      ),
    onSuccess: async (appointment) => {
      await queryClient.invalidateQueries({ queryKey: ME });
      router.replace(`/citas/${appointment.id}?aviso=solicitada`);
    },
    onError: async (error) => {
      // El horario se ocupó mientras se elegía: se vuelven a pedir los libres.
      if (error instanceof ApiError && error.problem.code === "slot_unavailable") {
        setStart("");
        await queryClient.invalidateQueries({ queryKey: ["availability"] });
      }
    },
  });

  const activePets = (pets.data ?? []).filter((p) => p.status === "active");
  const bookable = (services.data ?? []).filter((s) => s.active && s.bookable_by_client);

  const submit = () => {
    const found: Problems = {
      ...(pet ? {} : { pet: "Elige la mascota." }),
      ...(service ? {} : { service: "Elige el servicio." }),
      ...(start ? {} : { start: "Elige una hora libre." }),
    };
    setProblems(found);
    if (Object.keys(found).length === 0) request.mutate();
  };

  return (
    <Screen>
      <BackLink />
      <View style={{ gap: spacing(1.5) }}>
        <Heading>Solicitar una cita</Heading>
        <Body muted>Elige un horario libre. La veterinaria confirmará tu solicitud.</Body>
      </View>

      {request.isError ? <Notice tone="error">{errorMessage(request.error)}</Notice> : null}

      {pets.isPending || services.isPending ? (
        <Loading label="Cargando…" />
      ) : pets.isError || services.isError ? (
        <Notice tone="error">{errorMessage(pets.error ?? services.error)}</Notice>
      ) : activePets.length === 0 ? (
        <Notice tone="info">
          No tienes mascotas activas vinculadas. Pide en la veterinaria que te registren como su
          responsable.
        </Notice>
      ) : (
        <>
          <ChoiceChips
            label="Mascota"
            options={activePets.map((p) => ({ value: p.id, label: p.name }))}
            value={pet}
            onChange={setPet}
            error={problems.pet}
          />
          <ChoiceChips
            label="Servicio"
            options={bookable.map((s) => ({ value: s.id, label: s.name }))}
            value={service}
            onChange={(value) => {
              setService(value);
              setStart("");
            }}
            error={problems.service}
          />
          <SlotPicker
            serviceTypeId={service || null}
            day={day}
            start={start}
            onDayChange={setDay}
            onStartChange={setStart}
            error={start ? undefined : problems.start}
          />
          <TextField
            label="Motivo (opcional)"
            hint="Cuéntale a la veterinaria qué necesita tu mascota."
            value={reason}
            maxLength={500}
            multiline
            onChangeText={setReason}
          />
          <Button
            label="Enviar solicitud"
            icon={Send}
            loading={request.isPending}
            onPress={submit}
          />
        </>
      )}
    </Screen>
  );
}
