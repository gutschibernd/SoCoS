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

export default defineConfig(({ command }) => ({
  // **Nur im Bau `/static/`, im Betrieb des Dev-Servers `/`** — und beides ist
  // nötig.
  //
  // Gebaut wandert `dist/` über STATICFILES_DIRS nach `statisch_gesammelt`
  // und wird von WhiteNoise unter STATIC_URL ausgeliefert. Bei der Vorgabe `/`
  // schriebe Vite `/assets/index-….js` in die index.html; die Auffangroute in
  // konfiguration/urls.py nimmt aber nur api/, admin/, static/ und medien/
  // aus — der Bundle-Aufruf bekäme die React-Seite selbst zurück, als
  // text/html. Das sieht man lokal nie, weil dort der Dev-Server die Dateien
  // ausliefert; es fällt erst am Server auf, als weiße Seite.
  //
  // Im Dev-Server darf `base` **nicht** `/static/` sein: Dort zeigt der Proxy
  // unten `/static` auf Django, und die Oberfläche fände ihre eigenen Dateien
  // nicht mehr.
  base: command === "build" ? "/static/" : "/",

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
}));
