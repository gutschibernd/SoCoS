/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Ports kommen aus der Umgebung, damit ein Worktree eigene nehmen kann.
//
// Beides zusammen, nie nur eines: Ein Vite auf fremdem Port, dessen Proxy noch
// auf den Hauptport zeigt, mischt zwei Zweige in einer Ansicht — und das sieht
// man nicht.
//
// Vorgabe 5176 / 8003. 8000/5173 und 8001/5174 gehören zwei anderen Projekten
// auf derselben Maschine.
const eigenerPort = Number(process.env.PORT ?? 5176);
const djangoPort = Number(process.env.DJANGO_PORT ?? 8003);
const django = `http://127.0.0.1:${djangoPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: eigenerPort,
    strictPort: true, // lieber abbrechen als still auf einem anderen Port landen
    proxy: {
      "/api": { target: django, changeOrigin: false },
      "/anmelden": { target: django, changeOrigin: false },
      "/abmelden": { target: django, changeOrigin: false },
      "/admin": { target: django, changeOrigin: false },
      "/healthz": { target: django, changeOrigin: false },
      "/static": { target: django, changeOrigin: false },
      "/medien": { target: django, changeOrigin: false },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/aufbau.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
