import { createFileRoute } from "@tanstack/react-router";

// Baja de los avisos por mail. Es POST a propósito: los clientes de correo y
// los proxies de privacidad pre-cargan los links, así que un GET daría de baja
// a gente que nunca tocó nada. El link del mail abre /baja, que confirma acá.
const MAX_BODY_BYTES = 512;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/unsubscribe-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY_BYTES) return json({ ok: false }, 400);

          let body: { token?: unknown };
          try {
            body = JSON.parse(raw);
          } catch {
            return json({ ok: false }, 400);
          }

          const token =
            typeof body.token === "string" && UUID_RE.test(body.token) ? body.token : null;
          if (!token) return json({ ok: false }, 400);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("unsubscribe_concert_digest", { token });
          if (error) {
            console.error("[unsubscribe-digest] rpc failed", error);
            return json({ ok: false }, 500);
          }

          // data === false es un token que ya no existe: para quien hace clic
          // dos veces el resultado es el mismo, así que no lo tratamos como error.
          return json({ ok: true, removed: data === true });
        } catch (err) {
          console.error("[unsubscribe-digest] failed", err);
          return json({ ok: false }, 500);
        }
      },
    },
  },
});
