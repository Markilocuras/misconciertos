import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/track-click")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            concertId?: string;
            source?: string;
            buyUrl?: string;
          };
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("concert_clicks").insert({
            concert_id: body.concertId ?? null,
            source: body.source ?? null,
            buy_url: body.buyUrl ?? null,
            user_agent: request.headers.get("user-agent"),
            referrer: request.headers.get("referer"),
          });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
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
