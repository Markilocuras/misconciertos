import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config propia y deliberadamente mínima: `vite.config.ts` arma toda la app
// (TanStack Start, nitro, el preset de Cloudflare) y nada de eso hace falta
// para testear funciones puras. Acá solo el alias `@/`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Los tests corren en UTC a propósito, igual que el Worker en Cloudflare.
    // Esta máquina está en America/Buenos_Aires, así que sin esto los tests de
    // huso horario pasaban aunque el código no forzara la zona: la del sistema
    // ya era la correcta. Daban verde sobre un bug que en producción rompía.
    env: { TZ: "UTC" },
  },
});
