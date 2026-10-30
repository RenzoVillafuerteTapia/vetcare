import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";

import { Body, Brand, Button, Heading, Notice, Screen, TextField } from "@/components/ui";
import { errorMessage, unwrap } from "@/lib/api-error";
import { useSessionManager } from "@/session/context";
import { spacing } from "@/theme/tokens";

const schema = z.object({
  email: z.string().trim().min(1, "Ingresa tu correo.").pipe(z.email("Ingresa un correo válido.")),
});

/** Pide el enlace por correo. El enlace abre la web, donde se elige la nueva contraseña. */
export default function ForgotPasswordScreen() {
  const { api } = useSessionManager();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setSubmitError(null);
    try {
      await unwrap(api.POST("/api/v1/auth/password-reset", { body: { email } }));
      setSent(true);
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  });

  return (
    <Screen>
      <Brand />
      <View style={{ gap: spacing(2) }}>
        <Heading>Recuperar contraseña</Heading>
        <Body muted>Te enviaremos un enlace para elegir una nueva contraseña.</Body>
      </View>
      {sent ? (
        <View style={{ gap: spacing(4) }}>
          <Notice tone="success">
            Si el correo pertenece a una cuenta activa, recibirás un enlace. Vence en 30 minutos.
          </Notice>
          <Button
            label="Volver al inicio de sesión"
            variant="outline"
            onPress={() => router.back()}
          />
        </View>
      ) : (
        <View style={{ gap: spacing(4) }}>
          {submitError ? <Notice tone="error">{submitError}</Notice> : null}
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextField
                label="Correo"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.email?.message}
              />
            )}
          />
          <Button label="Enviar enlace" loading={isSubmitting} onPress={() => void onSubmit()} />
          <Button label="Volver" variant="ghost" onPress={() => router.back()} />
        </View>
      )}
    </Screen>
  );
}
