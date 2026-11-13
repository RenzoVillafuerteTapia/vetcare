// SecureStore no existe en Jest: un almacén en memoria por prueba.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

// Las fuentes no se cargan en Jest; se dan por cargadas para que la app no espere el splash.
jest.mock("expo-font", () => ({
  ...jest.requireActual("expo-font"),
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: async () => undefined,
}));

// El File de expo-file-system es un Blob del archivo local; en Jest, un Blob cualquiera.
jest.mock("expo-file-system", () => ({
  File: class extends Blob {
    readonly uri: string;
    constructor(uri: string) {
      super(["imagen"], { type: "image/jpeg" });
      this.uri = uri;
    }
  },
}));

// Galería y cámara: sin módulo nativo en Jest. Por defecto, permiso concedido y una foto elegida.
jest.mock("expo-image-picker", () => {
  const asset = { uri: "file:///fotos/luna.jpg", fileName: "luna.jpg", mimeType: "image/jpeg" };
  const result = { canceled: false, assets: [asset] };
  return {
    requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
    launchCameraAsync: jest.fn(async () => result),
    launchImageLibraryAsync: jest.fn(async () => result),
  };
});

// Avisos push: sin módulo nativo en Jest. `__state` deja que cada prueba simule el permiso, el
// token y el aviso con el que se abrió la app.
jest.mock("expo-notifications", () => {
  const state: { lastResponse: unknown } = { lastResponse: null };
  return {
    __state: state,
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
    requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[telefono-de-prueba]" })),
    addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    useLastNotificationResponse: () => state.lastResponse,
    clearLastNotificationResponse: jest.fn(() => {
      state.lastResponse = null;
    }),
  };
});
