import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, Send } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ANY_PROFESSIONAL,
  BackLink,
  ChoiceChips,
  Loading,
  ProfessionalPicker,
  SlotPicker,
  useProfessionals,
} from "@/components/appointments";
import { Body, Button, Card, Fact, Notice, PageHeader, Screen, TextField } from "@/components/ui";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { formatDuration } from "@/lib/labels";
import { ME, MY_APPOINTMENTS, MY_PETS, newIdempotencyKey, SERVICE_TYPES } from "@/lib/queries";
import { formatDate, limaDay, limaTime } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, spacing } from "@/theme/tokens";

type Step = 1 | 2 | 3;
type Problems = Partial<Record<"pet" | "service" | "start", string>>;

const STEP_TITLES: Record<Step, string> = {
  1: "Mascota y servicio",
  2: "Día y hora",
  3: "Confirmar",
};

/** Solicitar una cita en tres pasos cortos, para no apilar todo en una pantalla larga. */
export default function RequestAppointmentScreen() {
  const { petId: initialPet, serviceId: initialService } = useLocalSearchParams<{
    petId?: string;
    serviceId?: string;
  }>();
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const router = useRouter();
  // La misma clave en cada reintento: si la respuesta se pierde, no se duplica la solicitud.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const [step, setStep] = useState<Step>(1);
  const [pet, setPet] = useState(initialPet ?? "");
  const [service, setService] = useState(initialService ?? "");
  const [day, setDay] = useState(() => limaDay(Date.now()));
  const [start, setStart] = useState("");
  // `null`: todavía no eligió; se propone el profesional que atendió a la mascota la última vez.
  const [professional, setProfessional] = useState<string | null>(null);
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
  const appointments = useQuery({
    queryKey: MY_APPOINTMENTS,
    queryFn: () => unwrap(api.GET("/api/v1/me/appointments")),
  });
  const professionals = useProfessionals(service || null);
  const lastProfessional = [...(appointments.data ?? [])]
    .filter((a) => a.pet_id === pet && a.status !== "cancelled")
    .sort((a, b) => b.start.localeCompare(a.start))
    .flatMap((a) => a.resource_ids)
    .find((id) => professionals.data?.some((p) => p.id === id));
  const chosenProfessional = professional ?? lastProfessional ?? ANY_PROFESSIONAL;
  const professionalName =
    professionals.data?.find((p) => p.id === chosenProfessional)?.name ?? "Quien esté libre";

  const request = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/appointments", {
          params: { header: { "Idempotency-Key": idempotencyKey } },
          body: {
            pet_id: pet,
            service_type_id: service,
            start,
            reason: reason.trim() || null,
            resource_ids: chosenProfessional === ANY_PROFESSIONAL ? [] : [chosenProfessional],
          },
        }),
      ),
    onSuccess: async (appointment) => {
      await queryClient.invalidateQueries({ queryKey: ME });
      router.replace(`/citas/${appointment.id}?aviso=solicitada`);
    },
    onError: async (error) => {
      // El horario se ocupó mientras se elegía: se vuelven a pedir los libres y se regresa
      // al paso de la hora.
      if (error instanceof ApiError && error.problem.code === "slot_unavailable") {
        setStart("");
        setStep(2);
        await queryClient.invalidateQueries({ queryKey: ["availability"] });
      }
    },
  });

  const activePets = (pets.data ?? []).filter((p) => p.status === "active");
  const bookable = (services.data ?? []).filter((s) => s.active && s.bookable_by_client);
  const chosenPet = activePets.find((p) => p.id === pet);
  const chosenService = bookable.find((s) => s.id === service);
  // Con una sola mascota, ya está elegida.
  if (!pet && activePets.length === 1 && activePets[0]) setPet(activePets[0].id);

  const next = () => {
    if (step === 1) {
      const found: Problems = {
        ...(pet ? {} : { pet: "Elige la mascota." }),
        ...(service ? {} : { service: "Elige el servicio." }),
      };
      setProblems(found);
      if (Object.keys(found).length === 0) setStep(2);
    } else if (step === 2) {
      const found: Problems = start ? {} : { start: "Elige una hora libre." };
      setProblems(found);
      if (start) setStep(3);
    }
  };

  const loading = pets.isPending || services.isPending;
  const ready = !loading && !pets.isError && !services.isError && activePets.length > 0;

  const footer = ready ? (
    <>
      {step > 1 ? (
        <View style={{ flex: 1 }}>
          <Button
            label="Atrás"
            variant="outline"
            icon={ArrowLeft}
            onPress={() => setStep((step - 1) as Step)}
          />
        </View>
      ) : null}
      <View style={{ flex: 2 }}>
        {step < 3 ? (
          <Button label="Siguiente" icon={ArrowRight} onPress={next} />
        ) : (
          <Button
            label="Enviar solicitud"
            icon={Send}
            loading={request.isPending}
            onPress={() => request.mutate()}
          />
        )}
      </View>
    </>
  ) : undefined;

  return (
    <Screen tabs footer={footer}>
      <BackLink />
      <PageHeader
        title="Solicitar una cita"
        subtitle={`Paso ${step} de 3 · ${STEP_TITLES[step]}`}
      />
      <View style={styles.progress} accessibilityElementsHidden>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.progressStep, n <= step && styles.progressDone]} />
        ))}
      </View>

      {request.isError ? <Notice tone="error">{errorMessage(request.error)}</Notice> : null}

      {loading ? (
        <Loading label="Cargando…" />
      ) : pets.isError || services.isError ? (
        <Notice tone="error">{errorMessage(pets.error ?? services.error)}</Notice>
      ) : activePets.length === 0 ? (
        <Notice tone="info">
          No tienes mascotas activas vinculadas. Pide en la veterinaria que te registren como su
          responsable.
        </Notice>
      ) : step === 1 ? (
        <>
          <ChoiceChips
            label="Mascota"
            options={activePets.map((p) => ({ value: p.id, label: p.name }))}
            value={pet}
            onChange={(value) => {
              setPet(value);
              setProfessional(null);
            }}
            error={problems.pet}
          />
          <ChoiceChips
            label="Servicio"
            options={bookable.map((s) => ({ value: s.id, label: s.name }))}
            value={service}
            onChange={(value) => {
              setService(value);
              setStart("");
              setProfessional(null);
            }}
            error={problems.service}
          />
          {chosenService ? (
            <Body muted style={{ fontSize: 13 }}>
              Dura {formatDuration(chosenService.duration_minutes)}
              {chosenService.description ? ` · ${chosenService.description}` : ""}
            </Body>
          ) : null}
        </>
      ) : step === 2 ? (
        <>
          <ProfessionalPicker
            serviceTypeId={service}
            value={chosenProfessional}
            onChange={(value) => {
              setProfessional(value);
              setStart("");
            }}
          />
          <SlotPicker
            serviceTypeId={service || null}
            professionalId={chosenProfessional}
            day={day}
            start={start}
            onDayChange={setDay}
            onStartChange={setStart}
            error={start ? undefined : problems.start}
          />
        </>
      ) : (
        <>
          <Card style={styles.summary}>
            <Fact label="Mascota" value={chosenPet?.name ?? ""} />
            <Fact label="Servicio" value={chosenService?.name ?? ""} />
            <Fact label="Atiende" value={professionalName} />
            <Fact label="Día" value={start ? formatDate(start) : ""} />
            <Fact label="Hora" value={start ? limaTime(start) : ""} />
          </Card>
          <TextField
            label="Motivo (opcional)"
            hint="Cuéntale a la veterinaria qué necesita tu mascota."
            value={reason}
            maxLength={500}
            multiline
            onChangeText={setReason}
          />
          <Text style={styles.note}>La veterinaria confirmará tu solicitud y te avisaremos.</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: spacing(2) },
  progressStep: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.muted },
  progressDone: { backgroundColor: colors.primary },
  summary: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing(4), columnGap: spacing(4) },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },
});
