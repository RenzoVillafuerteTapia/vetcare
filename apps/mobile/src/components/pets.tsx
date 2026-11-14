import { PawPrint } from "lucide-react-native";
import type React from "react";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { Pet } from "@/lib/labels";
import { colors, fonts } from "@/theme/tokens";

/** Foto de la mascota, o una huella si no tiene o si la URL firmada ya no sirve. */
export function PetAvatar({
  pet,
  size = 56,
}: {
  pet: Pick<Pet, "name" | "photo_url">;
  size?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const radius = Math.round(size * 0.32);

  if (!pet.photo_url || failed === pet.photo_url) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}>
        <PawPrint size={Math.round(size * 0.42)} color={colors.primary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: pet.photo_url }}
      accessibilityLabel={`Foto de ${pet.name}`}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.muted }}
      onError={() => setFailed(pet.photo_url)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * Portada de la mascota: su foto a todo el ancho (o una huella sobre celeste si no tiene), con
 * el nombre arriba y sus datos en etiquetas abajo. `action` va en la esquina superior derecha.
 */
export function PetCover({
  pet,
  tags,
  action,
}: {
  pet: Pick<Pet, "name" | "photo_url">;
  tags: string[];
  action?: React.ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = pet.photo_url && failed !== pet.photo_url ? pet.photo_url : null;
  return (
    <View style={cover.card}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          accessibilityLabel={`Foto de ${pet.name}`}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(photo)}
        />
      ) : (
        <View style={cover.empty}>
          <PawPrint size={120} color="rgba(255,255,255,0.35)" />
        </View>
      )}
      <View style={cover.shade} />
      <View style={cover.top}>
        <Text accessibilityRole="header" style={cover.name} numberOfLines={1}>
          {pet.name}
        </Text>
        {action}
      </View>
      <View style={cover.tags}>
        {tags.map((tag) => (
          <View key={tag} style={cover.tag}>
            <Text style={cover.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const cover = StyleSheet.create({
  card: {
    height: 340,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: colors.sky,
    justifyContent: "space-between",
  },
  empty: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  shade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(29,35,41,0.12)",
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 20,
    gap: 12,
  },
  name: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    color: "#ffffff",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowRadius: 8,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(29,35,41,0.28)",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 13, color: "#ffffff" },
});

/** Tarjeta con la foto de la mascota y su nombre encima (tira del inicio). */
export function PetTile({ pet }: { pet: Pick<Pet, "name" | "photo_url"> }) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = pet.photo_url && failed !== pet.photo_url ? pet.photo_url : null;
  return (
    <View style={tile.card}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          accessibilityLabel={`Foto de ${pet.name}`}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(photo)}
        />
      ) : (
        <View style={tile.empty}>
          <PawPrint size={48} color="rgba(255,255,255,0.6)" />
        </View>
      )}
      <View style={tile.label}>
        <Text style={tile.name} numberOfLines={1}>
          {pet.name}
        </Text>
      </View>
    </View>
  );
}

const tile = StyleSheet.create({
  card: {
    width: 148,
    height: 184,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.sky,
    justifyContent: "flex-end",
    padding: 10,
  },
  empty: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.foreground },
});
