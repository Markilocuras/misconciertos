import { createFileRoute } from "@tanstack/react-router";

import { parsearPedido } from "@/lib/push-subscription";

// Alta, baja y migración de las suscripciones a avisos por push, más el
// fallback por mail del botón "Avisame de este show".
//
// Endpoint público sin auth que escribe con el cliente service-role, igual que
// track-click. A diferencia de artist_alerts —donde el navegador hace el INSERT
// directo con la clave anon— acá pasa por el servidor a propósito: una
// suscripción con el p256dh mal copiado no falla al guardarse, falla recién al
// encriptar, doce horas después y en otra máquina.
//
// Qué se acepta y qué se rechaza vive en @/lib/push-subscription, que es puro y
// tiene los tests. Acá queda sólo lo que toca la base.
const MAX_BODY_BYTES = 4096;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/subscribe-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "cuerpo" }, 400);

          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            return json({ ok: false, error: "cuerpo" }, 400);
          }

          const parseo = parsearPedido(body);
          if (!parseo.ok) return json({ ok: false, error: parseo.error }, 400);
          const pedido = parseo.pedido;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // El trigger de rate limit de las dos tablas levanta una excepción.
          // No es un problema nuestro ni del usuario: es el freno de spam
          // haciendo su trabajo, y merece un 429 y no un 500.
          const estado = (error: { message?: string }) =>
            error.message?.includes("rate limit") ? 429 : 500;

          if (pedido.accion === "mail") {
            const { error } = await supabaseAdmin
              .from("show_email_reminders")
              .insert({ concert_id: pedido.concertId, email: pedido.email });
            // 23505 = ya estaba anotado. Para quien tocó el botón es lo mismo
            // que un éxito, así que la respuesta es idéntica.
            if (error && error.code !== "23505") {
              console.error("[subscribe-push] recordatorio por mail falló", error);
              return json({ ok: false }, estado(error));
            }
            return json({ ok: true });
          }

          // Baja: el navegador ya hizo pushSubscription.unsubscribe(), acá sólo
          // queda limpiar. Sin artista ni show se va de todo lo que siga ese
          // dispositivo; con uno de los dos, sólo de eso —igual que la baja por
          // mail, que es por suscripción y no por persona—.
          if (pedido.accion === "baja") {
            let q = supabaseAdmin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", pedido.endpoint);
            if (pedido.artist) q = q.eq("artist", pedido.artist);
            else if (pedido.concertId) q = q.eq("concert_id", pedido.concertId);
            const { error } = await q;
            if (error) {
              console.error("[subscribe-push] baja falló", error);
              return json({ ok: false }, 500);
            }
            return json({ ok: true });
          }

          // Migración: el navegador rotó la suscripción por su cuenta. Las filas
          // viejas se mudan al endpoint nuevo en vez de perderse, que es lo que
          // pasaba si esperábamos al 410.
          if (pedido.accion === "migrar") {
            if (pedido.endpointViejo === pedido.endpoint) return json({ ok: true, migradas: 0 });

            const { data, error } = await supabaseAdmin
              .from("push_subscriptions")
              .update({
                endpoint: pedido.endpoint,
                p256dh: pedido.p256dh,
                auth: pedido.auth,
              })
              .eq("endpoint", pedido.endpointViejo)
              .select("id");
            if (error) {
              console.error("[subscribe-push] migración falló", error);
              return json({ ok: false }, 500);
            }
            return json({ ok: true, migradas: data?.length ?? 0 });
          }

          // Alta.
          const objetivo = pedido.artist
            ? { artist: pedido.artist }
            : { concert_id: pedido.concertId };

          const { error } = await supabaseAdmin.from("push_subscriptions").insert({
            ...objetivo,
            endpoint: pedido.endpoint,
            p256dh: pedido.p256dh,
            auth: pedido.auth,
          });

          // 23505 = este navegador ya seguía esto. No es un error: el navegador
          // puede reemitir la misma suscripción con claves nuevas —pasa cuando
          // el service worker se reinstala—, así que se refrescan y listo.
          //
          // Un upsert no sirve acá: los índices únicos son parciales (uno por
          // artista, otro por show, porque en Postgres (NULL, endpoint) no
          // choca con (NULL, endpoint)) y Postgres no infiere el ON CONFLICT
          // contra un índice parcial.
          if (error?.code === "23505") {
            let q = supabaseAdmin
              .from("push_subscriptions")
              .update({ p256dh: pedido.p256dh, auth: pedido.auth })
              .eq("endpoint", pedido.endpoint);
            q = pedido.artist
              ? q.eq("artist", pedido.artist)
              : q.eq("concert_id", pedido.concertId!);

            const { error: updErr } = await q;
            if (updErr) {
              console.error("[subscribe-push] refrescar claves falló", updErr);
              return json({ ok: false }, 500);
            }
            return json({ ok: true, yaEstaba: true });
          }

          if (error) {
            console.error("[subscribe-push] alta falló", error);
            return json({ ok: false }, estado(error));
          }

          return json({ ok: true });
        } catch (err) {
          console.error("[subscribe-push] failed", err);
          return json({ ok: false }, 500);
        }
      },
    },
  },
});
