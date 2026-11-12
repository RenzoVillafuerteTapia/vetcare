import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarPlus, Camera, ImageIcon, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppointmentCard, BackLink, Loading } from "@/components/appointments";
import { PetAvatar } from "@/components/pets";
import {
  ActionSheet,
  Badge,
  Body,
  Button,
  Card,
  Fact,
  Heading,
  Notice,
  Screen,
  Segmented,
} from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import {
  GUARDIAN_LABELS,
  SEX_LABELS,
  SPECIES_LABELS,
  past,
  upcoming,
  type Pet,
} from "@/lib/labels";
import { ME, MY_APPOINTMENTS, petKey } from "@/lib/queries";
import { formatCalendarDay, formatDate } from "@/lib/time";
import { useSessionManager } from "@/session/context";
import { colors, fonts, radius, spacing } from "@/theme/tokens";

type Section = "datos" | "citas" | "peso" | "responsables";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "datos", label: "Datos" },
  { value: "citas", label: "Citas" },
  { value: "peso", label: "Peso" },
  { value: "responsables", label: "Tutores" },
];

export default function PetScreen() {
  const { petId = "" } = useLocalSearchParams<{ petId: string }>();
  const { api } = useSessionManager();
  const [section, setSection] = useState<Section>("datos");

  const pet = useQuery({
    queryKey: petKey(petId),
    queryFn: () =>
      unwrap(api.GET("/api/v1/pets/{pet_id}", { params: { path: { pet_id: petId } } })),
  });

  if (pet.isPending) {
    return (
      <Screen tabs>
        <BackLink label="Mascotas" />
        <Loading label="Cargando el perfil…" />
      </Screen>
    );
  }
  if (pet.isError) {
    return (
      <Screen tabs>
        <BackLink label="Mascotas" />
        <Notice tone="error">{errorMessage(pet.error)}</Notice>
      </Screen>
    );
  }

  const data = pet.data;
  return (
    <Screen tabs>
      <BackLink label="Mascotas" />
      <PetHeader pet={data} />
      <Segmented segments={SECTIONS} value={section} onChange={setSection} />
      {section === "datos" ? <Details pet={data} /> : null}
      {section === "citas" ? <Appointments pet={data} /> : null}
      {section === "peso" ? <Weights pet={data} /> : null}
      {section === "responsables" ? <Guardians pet={data} /> : null}
    </Screen>
  );
}

// --- Encabezado y foto --------------------------------------------------------------------

function PetHeader({ pet }: { pet: Pet }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const [choosing, setChoosing] = useState(false);

  const saved = (updated: Pet) => {
    queryClient.setQueryData(petKey(pet.id), updated);
    void queryClient.invalidateQueries({ queryKey: ME });
  };

  const upload = useMutation({
    mutationFn: (asset: ImagePicker.ImagePickerAsset) =>
      unwrap(
        api.PUT("/api/v1/pets/{pet_id}/photo", {
          params: { path: { pet_id: pet.id } },
          // El contrato describe el archivo como texto binario; aquí es un File de Expo.
          body: { file: asset.uri },
          bodySerializer: () => {
            // El fetch de Expo solo acepta Blob o File en FormData (no el { uri, name, type }
            // clásico de React Native). El File de expo-file-system es un Blob del archivo local.
            const form = new FormData();
            form.append("file", new File(asset.uri), asset.fileName ?? "foto.jpg");
            return form;
          },
        }),
      ),
    onSuccess: saved,
  });
  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/api/v1/pets/{pet_id}/photo", { params: { path: { pet_id: pet.id } } })),
    onSuccess: saved,
  });

  const pick = async (source: "camera" | "library") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    };
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) upload.mutate(asset);
  };

  const busy = upload.isPending || remove.isPending;
  const error = upload.error ?? remove.error;

  return (
    <View style={{ gap: spacing(3) }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pet.can_change_photo ? `Cambiar la foto de ${pet.name}` : undefined}
          disabled={!pet.can_change_photo || busy}
          onPress={() => setChoosing(true)}
          style={{ opacity: busy ? 0.5 : 1 }}
        >
          <PetAvatar pet={pet} size={80} />
          {pet.can_change_photo ? (
            <View style={styles.cameraBadge}>
              <Camera size={14} color={colors.primaryForeground} />
            </View>
          ) : null}
        </Pressable>
        <View style={{ flex: 1, gap: spacing(1) }}>
          <Heading style={{ fontSize: 30, lineHeight: 34 }}>{pet.name}</Heading>
          <Body muted>
            {SPECIES_LABELS[pet.species]}
            {pet.breed ? ` · ${pet.breed}` : ""}
          </Body>
          {pet.status === "active" ? null : (
            <Badge>{pet.status === "deceased" ? "Fallecida" : "Transferida"}</Badge>
          )}
        </View>
      </View>
      {busy ? <Loading label="Guardando la foto…" /> : null}
      {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}
      <ActionSheet
        visible={choosing}
        title={`Foto de ${pet.name}`}
        onClose={() => setChoosing(false)}
        options={[
          { label: "Tomar una foto", icon: Camera, onPress: () => void pick("camera") },
          { label: "Elegir de la galería", icon: ImageIcon, onPress: () => void pick("library") },
          ...(pet.photo_url
            ? [
                {
                  label: "Quitar la foto",
                  icon: Trash2,
                  tone: "destructive" as const,
                  onPress: () => remove.mutate(),
                },
              ]
            : []),
        ]}
      />
    </View>
  );
}

// --- Secciones -----------------------------------------------------------------------------

function Details({ pet }: { pet: Pet }) {
  const birth = pet.birth_date
    ? `${formatCalendarDay(pet.birth_date)}${pet.birth_date_approximate ? " (aprox.)" : ""}`
    : "Sin registrar";
  const latest = pet.weights.at(-1);
  return (
    <Card style={styles.facts}>
      <Fact label="Sexo" value={SEX_LABELS[pet.sex]} />
      <Fact label="Nacimiento" value={birth} />
      <Fact label="Color" value={pet.color ?? "Sin registrar"} />
      <Fact
        label="Último peso"
        value={latest ? `${Number(latest.kilograms)} kg` : "Sin registrar"}
      />
      {/* La API solo envía las alergias si la tutela permite ver información clínica. */}
      {pet.allergies ? <Fact label="Alergias" value={pet.allergies} /> : null}
    </Card>
  );
}

function Appointments({ pet }: { pet: Pet }) {
  const { api } = useSessionManager();
  const router = useRouter();
  const appointments = useQuery({
    queryKey: MY_APPOINTMENTS,
    queryFn: () => unwrap(api.GET("/api/v1/me/appointments")),
  });
  const mine = (appointments.data ?? []).filter((a) => a.pet_id === pet.id);
  const next = upcoming(mine);
  const last = past(mine)[0];

  return (
    <View style={{ gap: spacing(3) }}>
      {appointments.isPending ? (
        <Loading label="Cargando citas…" />
      ) : next.length === 0 ? (
        <Body muted>{pet.name} no tiene citas próximas.</Body>
      ) : (
        next.map((appointment) => (
          <AppointmentCard key={appointment.id} appointment={appointment} />
        ))
      )}
      {last ? (
        <Body muted style={{ fontSize: 13 }}>
          Última visita: {formatDate(last.start)} · {last.service_name}
        </Body>
      ) : null}
      {pet.status === "active" ? (
        <Button
          label={`Solicitar cita para ${pet.name}`}
          icon={CalendarPlus}
          onPress={() => router.navigate(`/citas/nueva?petId=${pet.id}`)}
        />
      ) : null}
    </View>
  );
}

function Weights({ pet }: { pet: Pet }) {
  // Del más reciente al más antiguo, con la diferencia respecto del anterior.
  const rows = pet.weights
    .map((w, i) => ({
      ...w,
      kg: Number(w.kilograms),
      delta: i > 0 ? Number(w.kilograms) - Number(pet.weights[i - 1]?.kilograms) : null,
    }))
    .reverse()
    .slice(0, 8);
  if (rows.length === 0) {
    return (
      <Card>
        <Body muted>Todavía no hay pesos registrados. Se anotan en cada visita.</Body>
      </Card>
    );
  }
  const max = Math.max(...rows.map((r) => r.kg));
  return (
    <Card style={{ gap: spacing(3) }}>
      {rows.map((row) => (
        <View key={row.measured_at} style={{ gap: spacing(1) }}>
          <View style={styles.weightLine}>
            <Text style={styles.weightKg}>{row.kg} kg</Text>
            {row.delta !== null && row.delta !== 0 ? (
              <Text style={styles.weightDelta}>
                {row.delta > 0 ? "+" : ""}
                {Math.round(row.delta * 100) / 100} kg
              </Text>
            ) : null}
            <Text style={styles.weightDate}>{formatDate(row.measured_at)}</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.max((row.kg / max) * 100, 4)}%` }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function Guardians({ pet }: { pet: Pet }) {
  return (
    <View style={{ gap: spacing(3) }}>
      <Card style={{ gap: spacing(3) }}>
        {pet.guardians.map((guardian) => (
          <View key={guardian.client_id} style={styles.guardian}>
            <View style={{ flex: 1, gap: spacing(0.5) }}>
              <Body>{guardian.full_name}</Body>
              <Text style={styles.permissions}>
                {guardian.kind === "owner"
                  ? "Todos los permisos"
                  : [
                      guardian.permissions.can_book && "agenda citas",
                      guardian.permissions.can_pickup && "recoge a la mascota",
                      guardian.permissions.can_view_clinical && "ve lo clínico",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Solo consulta"}
              </Text>
            </View>
            <Badge>{GUARDIAN_LABELS[guardian.kind]}</Badge>
          </View>
        ))}
      </Card>
      <Body muted style={{ fontSize: 13 }}>
        Para agregar o quitar un responsable, pídelo en la veterinaria.
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  cameraBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.sidebar,
    alignItems: "center",
    justifyContent: "center",
  },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing(4), columnGap: spacing(4) },
  guardian: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  permissions: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },
  weightLine: { flexDirection: "row", alignItems: "baseline", gap: spacing(2) },
  weightKg: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  weightDelta: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.mutedForeground },
  weightDate: {
    marginLeft: "auto",
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.mutedForeground,
  },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.muted },
  barFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
});
