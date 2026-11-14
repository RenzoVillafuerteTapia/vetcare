/**
 * Tokens del sistema de diseño (docs/design/README.md), los mismos de la web convertidos de
 * oklch a hex porque React Native no interpreta oklch.
 */
export const colors = {
  // Fondo gris azulado y tinta oscura; el amarillo marca lo activo (la pestaña, lo elegido).
  background: "#eef2f6",
  foreground: "#1d2329",
  card: "#ffffff",
  primary: "#1d2329",
  primaryForeground: "#ffffff",
  secondary: "#dfe8f0",
  secondaryForeground: "#1d2329",
  muted: "#e9eef3",
  field: "#e4eaf0",
  input: "#d3dce4",
  mutedForeground: "#5f6b76",
  destructive: "#cc2827",
  success: "#2f8a5b",
  border: "#dbe2e9",
  ring: "#8aa8c1",
  sidebar: "#eef2f6",
  surfaceStrong: "#1d2329",
  surfaceStrongForeground: "#f2f5f8",
  // Acentos del rediseño.
  accent: "#f6e65f",
  accentForeground: "#1d2329",
  sky: "#8fadc6",
  skyForeground: "#ffffff",
  mint: "#bfe5cc",
  mintForeground: "#1f4d35",
  aqua: "#bfe4ef",
  aquaForeground: "#1d4b5a",
} as const;

export const fonts = {
  display: "Fredoka_500Medium",
  displayRegular: "Fredoka_400Regular",
  body: "Nunito_400Regular",
  bodySemibold: "Nunito_600SemiBold",
  bodyBold: "Nunito_700Bold",
} as const;

export const radius = {
  field: 18,
  card: 28,
  panel: 34,
  pill: 999,
} as const;

export const spacing = (n: number) => n * 4;
