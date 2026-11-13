/**
 * Componentes base de la app, con la forma del sistema de diseño (docs/design/README.md):
 * títulos en Fredoka, texto en Nunito, botones y etiquetas tipo píldora, esquinas amplias.
 */
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  PawPrint,
  type LucideIcon,
} from "lucide-react-native";
import { useId, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
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

/**
 * Pantalla con desplazamiento. Dentro de las pestañas, la barra inferior ya respeta el borde
 * seguro de abajo: por eso `tabs` solo protege el de arriba. `footer` queda fijo abajo (por
 * ejemplo, los botones de un paso), fuera del desplazamiento.
 */
export function Screen({
  children,
  background = colors.sidebar,
  contentStyle,
  tabs = false,
  footer,
  onRefresh,
}: {
  children: ReactNode;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
  tabs?: boolean;
  footer?: ReactNode;
  /** Deslizar hacia abajo para actualizar. */
  onRefresh?: () => Promise<unknown>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? () => {
        setRefreshing(true);
        void onRefresh().finally(() => setRefreshing(false));
      }
    : undefined;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: background }}
      edges={tabs ? ["top"] : ["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={[styles.screen, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          refresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** Título de pantalla compacto, con una acción opcional a la derecha. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, gap: spacing(1) }}>
        <Text accessibilityRole="header" style={styles.pageTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Body muted style={{ fontSize: 14, lineHeight: 20 }}>
            {subtitle}
          </Body>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/**
 * Pestañas dentro de una pantalla: dividen el contenido para no apilarlo todo en una columna
 * larga. Se anuncian como pestañas a los lectores de pantalla.
 */
export function Segmented<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentText, selected && styles.segmentTextSelected]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Fila de un menú o de una lista: ícono, texto, detalle y flecha. */
export function ListRow({
  icon: Icon,
  label,
  detail,
  onPress,
  tone = "default",
}: {
  icon?: LucideIcon;
  label: string;
  detail?: string;
  onPress?: () => void;
  tone?: "default" | "destructive";
}) {
  const color = tone === "destructive" ? colors.destructive : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
    >
      {Icon ? (
        <View style={styles.rowIcon}>
          <Icon size={18} color={tone === "destructive" ? colors.destructive : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: spacing(0.5) }}>
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
        {detail ? (
          <Text style={styles.rowDetail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onPress && tone === "default" ? (
        <ChevronRight size={18} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

/** Dato con su etiqueta, para fichas de solo lectura. */
export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: spacing(0.5), flexBasis: "45%", flexGrow: 1 }}>
      <Text style={styles.factLabel}>{label}</Text>
      <Body>{value}</Body>
    </View>
  );
}

export interface SheetOption {
  label: string;
  icon?: LucideIcon;
  tone?: "default" | "destructive";
  onPress: () => void;
}

/** Opciones que suben desde abajo (Android solo admite tres botones en una alerta). */
export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.sheetBackdrop}
        accessibilityLabel="Cerrar"
        accessibilityRole="button"
        onPress={onClose}
      />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          {title}
        </Text>
        {options.map((option) => (
          <ListRow
            key={option.label}
            icon={option.icon}
            label={option.label}
            tone={option.tone ?? "default"}
            onPress={() => {
              onClose();
              option.onPress();
            }}
          />
        ))}
        <Button label="Cancelar" variant="outline" onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={[styles.brandIcon, inverted && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
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
  screen: { flexGrow: 1, padding: spacing(5), gap: spacing(5) },
  footer: {
    flexDirection: "row",
    gap: spacing(3),
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.sidebar,
  },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: colors.foreground,
    letterSpacing: -0.3,
  },
  segmented: { flexDirection: "row", gap: spacing(2) },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(2),
    backgroundColor: colors.card,
  },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.foreground },
  segmentTextSelected: { fontFamily: fonts.bodyBold, color: colors.primaryForeground },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(1),
    borderRadius: radius.field,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15 },
  rowDetail: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },
  factLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.mutedForeground },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(15,29,30,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    padding: spacing(5),
    gap: spacing(1),
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.foreground,
    marginBottom: spacing(2),
  },
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
