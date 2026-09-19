import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(async ({ command, mode }) => {
  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];

  if (command === "build") {
    // Produces the Cloudflare Workers output consumed by wrangler.jsonc.
    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        defaultPreset: "cloudflare-module",
        // Cron Trigger de los recordatorios del día anterior.
        //
        // Va acá y no en wrangler.jsonc porque **ese archivo se ignora en el
        // deploy**: nitro genera su propio .output/server/wrangler.json y
        // .wrangler/deploy/config.json apunta ahí. Un `[triggers]` escrito a
        // mano en el wrangler.jsonc del repo no haría nada, en silencio.
        //
        // Con `scheduledTasks`, el preset cloudflare-module escribe los
        // `triggers.crons` en el wrangler.json generado y engancha el handler
        // `scheduled` del Worker. Después de tocar esto, verificar que el cron
        // salió: `grep triggers .output/server/wrangler.json`.
        experimental: { tasks: true },
        tasks: {
          recordatorios: {
            // Absoluto: nitro arma un módulo virtual con estos handlers y un
            // "./src/..." relativo se le escapa como bare specifier, que rollup
            // no resuelve.
            handler: fileURLToPath(new URL("./src/tasks/recordatorios.ts", import.meta.url)),
            description: "Avisa por los shows de mañana",
          },
        },
        // 11:30 UTC = 08:30 en Buenos Aires. Una vez por día y de mañana: a esa
        // hora "los shows de mañana" son los que están a entre 24 y 48 horas,
        // que es la ventana que queremos, y el aviso llega a una hora en la que
        // se lee.
        scheduledTasks: { "30 11 * * *": ["recordatorios"] },
      }),
    );
  }

  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    define: envDefine,
    // Matches Tailwind v4's own CSS pipeline so dev and build output agree.
    css: { transformer: "lightningcss" as const },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    server: { host: "::", port: 8080 },
  };
});
