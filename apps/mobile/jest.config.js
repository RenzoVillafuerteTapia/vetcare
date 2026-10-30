/** @type {import('jest').Config} */
module.exports = {
  // lucide-react-native publica ESM en .mjs para React Native; en Jest se usa su build CommonJS.
  preset: "jest-expo",
  // La primera carga de Expo Router en una prueba tarda varios segundos.
  testTimeout: 30_000,
  setupFiles: ["./src/test/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^lucide-react-native$": require.resolve("lucide-react-native"),
  },
  // Los paquetes de Expo, React Native y del monorepo se publican sin transpilar.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|react-navigation|@react-navigation/.*|lucide-react-native|react-native-svg|standard-navigation|@vetcare/.*))",
  ],
};
