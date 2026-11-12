import { PawPrint } from "lucide-react-native";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import type { Pet } from "@/lib/labels";
import { colors } from "@/theme/tokens";

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
