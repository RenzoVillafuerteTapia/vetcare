/// <reference types="vitest/config" />
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Las librerías cambian menos que la app: en chunks propios quedan en la caché del
        // navegador entre despliegues.
        manualChunks(id) {
          // Vite normaliza los ids con "/" también en Windows.
          const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id);
          if (!match) return undefined;
          const pkg = match[1];
          if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") return "react";
          if (pkg === "zod" || pkg === "react-hook-form" || pkg?.startsWith("@hookform/"))
            return "forms";
          if (pkg === "radix-ui" || pkg?.startsWith("@radix-ui/") || pkg === "lucide-react")
            return "ui";
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
  },
});
