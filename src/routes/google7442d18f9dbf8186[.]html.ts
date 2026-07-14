import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Verificación de Google Search Console. Va como ruta del server (no como
// asset en public/) porque el hosting de assets de Cloudflare redirige
// /x.html → /x, y Google exige un 200 en la URL exacta con .html.
export const Route = createFileRoute("/google7442d18f9dbf8186.html")({
  server: {
    handlers: {
      GET: () =>
        new Response("google-site-verification: google7442d18f9dbf8186.html", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    },
  },
});
