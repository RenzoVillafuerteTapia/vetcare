import * as SecureStore from "expo-secure-store";

/** Dónde se guarda el refresh token entre aperturas de la app. */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "vetcare.refresh_token";

/** Keychain en iOS y Keystore en Android. Solo accesible con el dispositivo desbloqueado. */
export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
