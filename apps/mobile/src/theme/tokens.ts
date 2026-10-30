/**
 * Tokens del sistema de diseño (docs/design/README.md), los mismos de la web convertidos de
 * oklch a hex porque React Native no interpreta oklch.
 */
export const colors = {
  background: "#fbfaf7",
  foreground: "#0f1d1e",
  card: "#ffffff",
  primary: "#00736a",
  primaryForeground: "#f3fcfb",
  secondary: "#e4f2f0",
  secondaryForeground: "#033633",
  muted: "#f1f0ec",
  field: "#e8e6e0",
  input: "#d9d7d0",
  mutedForeground: "#516162",
  destructive: "#cc2827",
  success: "#187c49",
  border: "#dfded8",
  ring: "#319287",
  sidebar: "#f5f3ef",
  surfaceStrong: "#0e2c2c",
  surfaceStrongForeground: "#eef7f6",
} as const;

export const fonts = {
  display: "Fredoka_500Medium",
  displayRegular: "Fredoka_400Regular",
  body: "Nunito_400Regular",
  bodySemibold: "Nunito_600SemiBold",
  bodyBold: "Nunito_700Bold",
} as const;

export const radius = {
  field: 16,
  card: 24,
  panel: 32,
  pill: 999,
} as const;

export const spacing = (n: number) => n * 4;
