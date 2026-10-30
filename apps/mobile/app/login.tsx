import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { z } from "zod";

import { Body, Brand, Button, Heading, Notice, Screen, TextField } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { useSession, useSessionManager } from "@/session/context";
import { colors, fonts, spacing } from "@/theme/tokens";

const schema = z.object({
  email: z.string().trim().min(1, "Ingresa tu correo.").pipe(z.email("Ingresa un correo válido.")),
  password: z.string().min(1, "Ingresa tu contraseña."),
});

type Values = z.infer<typeof schema>;

export default function LoginScreen() {
  const manager = useSessionManager();
  const session = useSession();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    try {
      await manager.login(email, password);
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  });

  const expired = session.status === "anonymous" && session.reason === "expired";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen contentStyle={styles.content}>
        <View style={styles.hero}>
          <Brand inverted />
          <Heading style={styles.heroTitle}>El cuidado de tu mascota, siempre a la vista.</Heading>
          <Body style={styles.heroText}>
            Citas, servicios en curso e indicaciones de la veterinaria en un solo lugar.
          </Body>
        </View>

        <View style={styles.form}>
          <Heading style={styles.title}>Iniciar sesión</Heading>
          {expired && !submitError ? (
            <Notice tone="info">Tu sesión venció. Ingresa de nuevo.</Notice>
          ) : null}
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
                textContentType="username"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.email?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <TextField
                label="Contraseña"
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                onSubmitEditing={() => void onSubmit()}
                error={errors.password?.message}
              />
            )}
          />
          <Button label="Ingresar" loading={isSubmitting} onPress={() => void onSubmit()} />
          <Link href="/recuperar-contrasena" style={styles.link}>
            ¿Olvidaste tu contraseña?
          </Link>
          <Body muted style={styles.footnote}>
            Tu cuenta la crea la veterinaria. Si no recibiste la invitación, pídela en recepción.
          </Body>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing(3) },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: 32,
    padding: spacing(6),
    gap: spacing(4),
  },
  heroTitle: { color: "#fff", fontSize: 30, lineHeight: 34 },
  heroText: { color: "rgba(255,255,255,0.85)" },
  form: { gap: spacing(4) },
  title: { fontSize: 28, lineHeight: 32 },
  link: {
    alignSelf: "center",
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    paddingVertical: spacing(2),
  },
  footnote: { textAlign: "center", fontSize: 13 },
});
