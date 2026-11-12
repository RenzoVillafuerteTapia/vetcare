import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fieldErrors } from "@vetcare/shared";
import { Save } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { BackLink, Loading } from "@/components/appointments";
import { Body, Button, Card, Fact, Notice, PageHeader, Screen, TextField } from "@/components/ui";
import { ApiError, errorMessage, unwrap } from "@/lib/api-error";
import { DOCUMENT_LABELS, type Profile } from "@/lib/labels";
import { MY_PROFILE } from "@/lib/queries";
import { useSessionManager } from "@/session/context";
import { spacing } from "@/theme/tokens";

export default function ContactScreen() {
  const { api } = useSessionManager();
  const profile = useQuery({
    queryKey: MY_PROFILE,
    queryFn: () => unwrap(api.GET("/api/v1/me/profile")),
  });

  return (
    <Screen tabs>
      <BackLink label="Cuenta" />
      <PageHeader title="Mis datos" subtitle="La veterinaria usa estos datos para ubicarte." />
      {profile.isPending ? (
        <Loading label="Cargando tus datos…" />
      ) : profile.isError ? (
        <Notice tone="error">{errorMessage(profile.error)}</Notice>
      ) : (
        <ContactForm profile={profile.data} />
      )}
    </Screen>
  );
}

function ContactForm({ profile }: { profile: Profile }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.address ?? "");

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT("/api/v1/me/profile", {
          body: { phone: phone.trim(), address: address.trim() || null },
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(MY_PROFILE, updated);
      setPhone(updated.phone);
    },
  });
  const errors =
    save.error instanceof ApiError && save.error.status === 422
      ? fieldErrors(save.error.problem)
      : {};

  return (
    <View style={{ gap: spacing(5) }}>
      <Card style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing(4) }}>
        <Fact label="Nombre" value={profile.full_name} />
        <Fact label={DOCUMENT_LABELS[profile.document_type]} value={profile.document_number} />
        <Fact label="Correo" value={profile.email ?? "Sin registrar"} />
      </Card>
      <Body muted style={{ fontSize: 13, marginTop: -spacing(2) }}>
        Para corregir tu nombre o documento, pídelo en la veterinaria.
      </Body>

      {save.isSuccess ? <Notice tone="success">Guardamos tus datos.</Notice> : null}
      {save.isError && Object.keys(errors).length === 0 ? (
        <Notice tone="error">{errorMessage(save.error)}</Notice>
      ) : null}

      <TextField
        label="Teléfono"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={phone}
        maxLength={20}
        onChangeText={setPhone}
        error={errors.phone?.join(" ")}
      />
      <TextField
        label="Dirección (opcional)"
        autoComplete="street-address"
        value={address}
        maxLength={200}
        onChangeText={setAddress}
        error={errors.address?.join(" ")}
      />
      <Button label="Guardar" icon={Save} loading={save.isPending} onPress={() => save.mutate()} />
    </View>
  );
}
