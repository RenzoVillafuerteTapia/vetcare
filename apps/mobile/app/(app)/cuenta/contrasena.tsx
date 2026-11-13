import { useMutation } from "@tanstack/react-query";
import { fieldErrors } from "@vetcare/shared";
import { KeyRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { BackLink } from "@/components/appointments";
import { Button, Notice, PageHeader, Screen, TextField } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api-error";
import { useSessionManager } from "@/session/context";
import { spacing } from "@/theme/tokens";

type Problems = Partial<Record<"current" | "next" | "confirm", string>>;

export default function ChangePasswordScreen() {
  const manager = useSessionManager();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problems, setProblems] = useState<Problems>({});

  const change = useMutation({
    mutationFn: () => manager.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const fields = fieldErrors(error.problem);
        setProblems({
          ...(fields.current_password ? { current: fields.current_password.join(" ") } : {}),
          ...(fields.new_password ? { next: fields.new_password.join(" ") } : {}),
        });
      }
    },
  });

  const submit = () => {
    const found: Problems = {
      ...(current ? {} : { current: "Escribe tu contraseña actual." }),
      ...(next.length >= 10 ? {} : { next: "Usa al menos 10 caracteres." }),
      ...(confirm === next ? {} : { confirm: "No coincide con la nueva contraseña." }),
    };
    setProblems(found);
    if (Object.keys(found).length === 0) change.mutate();
  };

  const generalError =
    change.isError && !(change.error instanceof ApiError && change.error.status === 422);

  return (
    <Screen tabs>
      <BackLink label="Cuenta" />
      <PageHeader
        title="Cambiar contraseña"
        subtitle="Se cerrará la sesión en tus otros dispositivos; en este sigues conectado."
      />
      {change.isSuccess ? <Notice tone="success">Cambiamos tu contraseña.</Notice> : null}
      {generalError ? <Notice tone="error">{errorMessage(change.error)}</Notice> : null}
      <View style={{ gap: spacing(4) }}>
        <TextField
          label="Contraseña actual"
          secureTextEntry
          autoComplete="current-password"
          value={current}
          onChangeText={setCurrent}
          error={problems.current}
        />
        <TextField
          label="Nueva contraseña"
          secureTextEntry
          autoComplete="new-password"
          hint="Al menos 10 caracteres. Una frase es más fácil de recordar."
          value={next}
          onChangeText={setNext}
          error={problems.next}
        />
        <TextField
          label="Repite la nueva contraseña"
          secureTextEntry
          autoComplete="new-password"
          value={confirm}
          onChangeText={setConfirm}
          error={problems.confirm}
        />
      </View>
      <Button
        label="Cambiar contraseña"
        icon={KeyRound}
        loading={change.isPending}
        onPress={submit}
      />
    </Screen>
  );
}
