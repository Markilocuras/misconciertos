import { createFileRoute } from "@tanstack/react-router";
import { safeHttpUrl } from "@/lib/ingest-parsers";

// Endpoint público sin auth que escribe con el cliente service-role: todo lo
// que entra se valida/trunca para que nadie pueda llenar la tabla de basura.
const MAX_BODY_BYTES = 2048;
const MAX_HEADER_CHARS = 256;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

export const Route = createFileRoute("/api/public/hooks/track-click")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ok = new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY_BYTES) return ok;

          let body: { concertId?: unknown; source?: unknown; buyUrl?: unknown };
          try {
            body = JSON.parse(raw);
          } catch {
            return ok;
          }

          const concertId =
            typeof body.concertId === "string" && UUID_RE.test(body.concertId)
              ? body.concertId
              : null;
          const source =
            typeof body.source === "string" ? truncate(body.source, MAX_HEADER_CHARS) : null;
          const buyUrl = typeof body.buyUrl === "string" ? safeHttpUrl(body.buyUrl) : null;

          // Sin al menos un dato útil no hay nada que registrar.
          if (!concertId && !buyUrl) return ok;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("concert_clicks").insert({
            concert_id: concertId,
            source,
            buy_url: buyUrl,
            user_agent: truncate(request.headers.get("user-agent"), MAX_HEADER_CHARS),
            referrer: truncate(request.headers.get("referer"), MAX_HEADER_CHARS),
          });
          return ok;
        } catch (err) {
          console.error("[track-click] failed", err);
          return new Response(JSON.stringify({ ok: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
