import { createFileRoute } from "@tanstack/react-router";
import Firecrawl from "@mendable/firecrawl-js";
import { z } from "zod";

// Listings que vamos a scrapear. Podés agregar/quitar URLs acá.
const SOURCES: Array<{ source: string; url: string }> = [
  { source: "ticketmaster", url: "https://www.ticketmaster.com.ar/category/57693/musica" },
  { source: "ticketek", url: "https://www.ticketek.com.ar/" },
  { source: "allaccess", url: "https://www.allaccess.com.ar/event" },
];

// Coordenadas conocidas de venues comunes en Buenos Aires.
// Si el scraper no extrae lat/lng, intentamos matchear por nombre del venue.
const VENUE_COORDS: Record<string, { lat: number; lng: number }> = {
  "movistar arena": { lat: -34.5953, lng: -58.4475 },
  "estadio luna park": { lat: -34.6022, lng: -58.3686 },
  "luna park": { lat: -34.6022, lng: -58.3686 },
  "teatro gran rex": { lat: -34.6033, lng: -58.3814 },
  "gran rex": { lat: -34.6033, lng: -58.3814 },
  "teatro opera": { lat: -34.6034, lng: -58.3823 },
  "teatro coliseo": { lat: -34.5993, lng: -58.3811 },
  "niceto club": { lat: -34.5862, lng: -58.4378 },
  "usina del arte": { lat: -34.6345, lng: -58.3597 },
  "mandarine park": { lat: -34.5453, lng: -58.4361 },
  "teatro vorterix": { lat: -34.5733, lng: -58.4503 },
  "bebop club": { lat: -34.5889, lng: -58.4298 },
  "estadio obras": { lat: -34.5456, lng: -58.4495 },
  "obras sanitarias": { lat: -34.5456, lng: -58.4495 },
  "c art media": { lat: -34.5697, lng: -58.4416 },
  "complejo c art media": { lat: -34.5697, lng: -58.4416 },
  "estadio único": { lat: -34.9215, lng: -57.9919 },
  "campo argentino de polo": { lat: -34.5746, lng: -58.4131 },
  "hipódromo de palermo": { lat: -34.5687, lng: -58.4263 },
  "estadio river plate": { lat: -34.5453, lng: -58.4498 },
  "monumental": { lat: -34.5453, lng: -58.4498 },
  "la trastienda": { lat: -34.6189, lng: -58.3705 },
  "groove": { lat: -34.5867, lng: -58.4259 },
};

function findVenueCoords(venue: string | null | undefined): { lat: number | null; lng: number | null } {
  if (!venue) return { lat: null, lng: null };
  const key = venue.toLowerCase().trim();
  for (const [name, coords] of Object.entries(VENUE_COORDS)) {
    if (key.includes(name)) return coords;
  }
  return { lat: null, lng: null };
}

const eventSchema = z.object({
  events: z.array(
    z.object({
      title: z.string().describe("Nombre del evento o concierto"),
      artist: z.string().nullable().optional().describe("Artista principal"),
      venue: z.string().nullable().optional().describe("Nombre del lugar/sala"),
      date: z.string().nullable().optional().describe("Fecha en formato YYYY-MM-DD si es posible"),
      time: z.string().nullable().optional().describe("Hora del show ej '21:00'"),
      price: z.string().nullable().optional().describe("Precio o rango ej 'ARS 15.000'"),
      description: z.string().nullable().optional(),
      image_url: z.string().nullable().optional().describe("URL absoluta de la imagen del evento"),
      buy_url: z.string().nullable().optional().describe("URL absoluta para comprar entradas"),
    }),
  ),
});

type ScrapedEvent = z.infer<typeof eventSchema>["events"][number];

function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const iso = input.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function makeExternalId(source: string, ev: ScrapedEvent): string {
  if (ev.buy_url) return ev.buy_url;
  return `${source}:${ev.title}:${ev.date ?? ""}:${ev.venue ?? ""}`.slice(0, 200);
}

export const Route = createFileRoute("/api/public/hooks/ingest-concerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth con secreto dedicado almacenado en public.cron_secrets (solo
        // service_role puede leerlo). No reutilizamos la anon key, que es pública.
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("Authorization")?.replace("Bearer ", "");
        if (!provided) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: secretRow, error: secretErr } = await supabaseAdmin
          .from("cron_secrets")
          .select("value")
          .eq("id", "ingest")
          .maybeSingle();
        if (secretErr || !secretRow?.value) {
          return new Response(JSON.stringify({ error: "Server not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { timingSafeEqual } = await import("crypto");
        const a = Buffer.from(provided);
        const b = Buffer.from(secretRow.value);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!process.env.FIRECRAWL_API_KEY) {
          return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const results: Record<string, { scraped: number; upserted: number; error?: string }> = {};

        for (const { source, url } of SOURCES) {
          try {
            const scrape = await firecrawl.scrape(url, {
              formats: [
                {
                  type: "json",
                  schema: eventSchema,
                  prompt:
                    "Extraé todos los conciertos/eventos musicales listados en esta página. Incluí nombre, artista, lugar, fecha, hora, precio y URL para comprar entradas. Si la fecha está en español (ej '15 de mayo'), convertila a YYYY-MM-DD asumiendo el próximo año disponible.",
                },
              ],
              onlyMainContent: true,
            });

            // SDK v2 returns result.json on the result object, but normalize defensively
            const json =
              (scrape as { json?: { events?: ScrapedEvent[] } }).json ??
              (scrape as { data?: { json?: { events?: ScrapedEvent[] } } }).data?.json;
            const events = json?.events ?? [];

            const rows = events
              .map((ev) => {
                const date = normalizeDate(ev.date);
                const coords = findVenueCoords(ev.venue);
                return {
                  source,
                  external_id: makeExternalId(source, ev),
                  title: ev.title,
                  artist: ev.artist ?? null,
                  venue: ev.venue ?? null,
                  date,
                  time: ev.time ?? null,
                  price: ev.price ?? null,
                  description: ev.description ?? null,
                  image_url: safeHttpUrl(ev.image_url),
                  lat: coords.lat,
                  lng: coords.lng,
                  buy_url: safeHttpUrl(ev.buy_url),
                  last_seen_at: new Date().toISOString(),
                };
              })
              .filter((r) => r.title && r.title.length > 0);

            if (rows.length > 0) {
              const { error } = await supabaseAdmin
                .from("concerts")
                .upsert(rows, { onConflict: "source,external_id" });
              if (error) throw error;
            }

            results[source] = { scraped: events.length, upserted: rows.length };
          } catch (err) {
            console.error(`[ingest-concerts] ${source} failed`, err);
            results[source] = { scraped: 0, upserted: 0, error: err instanceof Error ? err.message : String(err) };
          }
        }

        return new Response(JSON.stringify({ ok: true, results }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
