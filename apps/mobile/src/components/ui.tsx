/**
 * Componentes base de la app, con la forma del sistema de diseño (docs/design/README.md):
 * títulos en Fredoka, texto en Nunito, botones y etiquetas tipo píldora, esquinas amplias.
 */
import { CircleAlert, CircleCheck, PawPrint, type LucideIcon } from "lucide-react-native";
import { useId, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing } from "@/theme/tokens";

// --- Texto -------------------------------------------------------------------------------

export function Heading({ style, ...props }: TextProps) {
  return <Text accessibilityRole="header" style={[styles.heading, style]} {...props} />;
}

export function Body({ style, muted = false, ...props }: TextProps & { muted?: boolean }) {
  return (
    <Text style={[styles.body, muted && { color: colors.mutedForeground }, style]} {...props} />
  );
}

// --- Contenedores ------------------------------------------------------------------------

export function Screen({
  children,
  background = colors.sidebar,
  contentStyle,
}: {
  children: ReactNode;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={[styles.screen, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={[styles.brandIcon, inverted && { backgroundColor: "rgba(255,255,255,0.15)" }]}>
        <PawPrint size={20} color={inverted ? "#fff" : colors.primaryForeground} />
      </View>
      <Text style={[styles.brandText, inverted && { color: "#fff" }]}>VetCare</Text>
    </View>
  );
}

export function Badge({ children, glass = false }: { children: ReactNode; glass?: boolean }) {
  return (
    <View style={[styles.badge, glass && styles.badgeGlass]}>
      <Text style={[styles.badgeText, glass && { color: colors.surfaceStrongForeground }]}>
        {children}
      </Text>
    </View>
  );
}

// --- Acciones ----------------------------------------------------------------------------

type ButtonVariant = "primary" | "strong" | "outline" | "ghost";

const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.primaryForeground },
  strong: { bg: colors.surfaceStrong, fg: colors.surfaceStrongForeground },
  outline: { bg: colors.card, fg: colors.foreground, border: colors.border },
  ghost: { bg: "transparent", fg: colors.primary },
};

export function Button({
  label,
  variant = "primary",
  loading = false,
  disabled,
  icon: Icon,
  ...props
}: Omit<PressableProps, "children"> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: LucideIcon;
}) {
  const palette = BUTTON_COLORS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border ?? palette.bg,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : Icon ? (
        <Icon size={18} color={palette.fg} />
      ) : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

// --- Formularios -------------------------------------------------------------------------

export function TextField({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; error?: string | undefined; hint?: string }) {
  const id = useId();
  return (
    <View style={styles.field}>
      <Text nativeID={`${id}-label`} style={styles.label}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={`${id}-label`}
        accessibilityHint={error ?? hint}
        aria-invalid={!!error}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...props}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const color =
    tone === "error" ? colors.destructive : tone === "success" ? colors.success : colors.foreground;
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, { borderColor: tone === "info" ? colors.border : color }]}
    >
      <Icon size={18} color={color} />
      <Text style={[styles.noticeText, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.foreground },
  screen: { flexGrow: 1, padding: spacing(5), gap: spacing(6) },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing(5),
    gap: spacing(3),
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing(2.5) },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { fontFamily: fonts.display, fontSize: 20, color: colors.foreground },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
  },
  badgeGlass: { backgroundColor: "rgba(255,255,255,0.15)", borderColor: "transparent" },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.foreground },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
  },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  field: { gap: spacing(2) },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.foreground },
  input: {
    minHeight: 48,
    borderRadius: radius.field,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.input,
    paddingHorizontal: spacing(4),
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.foreground,
  },
  inputError: { borderColor: colors.destructive, backgroundColor: "#fdf1f1" },
  error: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.destructive },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },
  notice: {
    flexDirection: "row",
    gap: spacing(3),
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: radius.field,
    backgroundColor: colors.card,
    padding: spacing(4),
  },
  noticeText: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20 },
});
