import { createFileRoute } from "@tanstack/react-router";
import Firecrawl from "@mendable/firecrawl-js";
import { z } from "zod";

// Listings que vamos a scrapear. Podés agregar/quitar URLs acá.
// Elegimos agregadores con HTML server-side (funcionan bien con Firecrawl).
const SOURCES: Array<{ key: string; source: string; url: string; waitFor?: number }> = [
  { key: "allevents-concerts", source: "allevents", url: "https://allevents.in/buenos-aires/concerts" },
  { key: "allevents-music", source: "allevents", url: "https://allevents.in/buenos-aires/music" },
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
  "parque sarmiento": { lat: -34.5548, lng: -58.4936 },
  "estadio malvinas argentinas": { lat: -34.6026, lng: -58.4592 },
  "microestadio malvinas": { lat: -34.6026, lng: -58.4592 },
  "teatro colón": { lat: -34.6011, lng: -58.3832 },
  "teatro colon": { lat: -34.6011, lng: -58.3832 },
  "centro galicia": { lat: -34.6095, lng: -58.4128 },
  "palacio alsina": { lat: -34.6101, lng: -58.3737 },
  "costa 21": { lat: -34.5444, lng: -58.4383 },
  "teatro flores": { lat: -34.6284, lng: -58.4635 },
  "estadio velez": { lat: -34.6356, lng: -58.5203 },
  "vélez": { lat: -34.6356, lng: -58.5203 },
  "estadio geba": { lat: -34.5694, lng: -58.4225 },
  "geba": { lat: -34.5694, lng: -58.4225 },
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

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  ene: 1,
  enero: 1,
  feb: 2,
  february: 2,
  febrero: 2,
  mar: 3,
  march: 3,
  marzo: 3,
  apr: 4,
  april: 4,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  june: 6,
  junio: 6,
  jul: 7,
  july: 7,
  julio: 7,
  aug: 8,
  august: 8,
  ago: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  september: 9,
  septiembre: 9,
  oct: 10,
  october: 10,
  octubre: 10,
  nov: 11,
  november: 11,
  noviembre: 11,
  dec: 12,
  december: 12,
  dic: 12,
  diciembre: 12,
};

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateAndTime(input: string): { date: string | null; time: string | null } {
  const normalized = input.replace(/^[-*]\s*/, "").replace(/\s+\+\s+\d+\s+more/i, "").trim();
  const explicit = normalized.match(
    /(?:mon|tue|wed|thu|fri|sat|sun|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)?\s*,?\s*(\d{1,2})\s+([a-záéíóúñ]+)\s*,?\s*(\d{4})?\s*(?:[-•]|a las)?\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i,
  );
  if (!explicit) return { date: normalizeDate(input), time: null };

  const day = Number(explicit[1]);
  const month = MONTHS[explicit[2].toLowerCase()];
  if (!month || !day) return { date: normalizeDate(input), time: null };

  const now = new Date();
  let year = explicit[3] ? Number(explicit[3]) : now.getFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  if (!explicit[3] && candidate < today) year += 1;

  let hour = Number(explicit[4]);
  const minute = Number(explicit[5]);
  const meridiem = explicit[6]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return {
    date: toIsoDate(year, month, day),
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

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

function absolutizeUrl(input: string | null | undefined, baseUrl: string): string | null {
  if (!input) return null;
  try {
    return safeHttpUrl(new URL(input, baseUrl).toString());
  } catch {
    return safeHttpUrl(input);
  }
}

function stripMarkdown(input: string): string {
  return input
    .replace(/\*\*/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeDateLine(line: string): boolean {
  return /(?:mon|tue|wed|thu|fri|sat|sun|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\s*,?\s*\d{1,2}\s+[a-záéíóúñ]+/i.test(line);
}

function looksLikeNoise(line: string): boolean {
  return (
    /^!\[/.test(line) ||
    /^\|$/.test(line) ||
    /interested/i.test(line) ||
    /^(share|open app|sign in|create event|get updates|added to interests)$/i.test(line) ||
    /^\[.*\]\(#\)$/.test(line)
  );
}

function extractPrice(lines: string[]): string | null {
  const found = lines.find((line) => /\b(ARS|EUR|USD|free|gratis|\$)\b/i.test(line) && line.length <= 80);
  return found ? stripMarkdown(found.replace(/^[-*]\s*/, "")) : null;
}

function deriveArtist(title: string): string | null {
  const separators = [" • ", " - ", " en ", " in "];
  for (const separator of separators) {
    const [first] = title.split(separator);
    if (first && first.length >= 2 && first.length < title.length) return first.trim();
  }
  return title;
}

function parseEventsFromMarkdown(markdown: string, baseUrl: string): ScrapedEvent[] {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const segments: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (looksLikeDateLine(line)) {
      if (current?.length) segments.push(current);
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current?.length) segments.push(current);

  return segments
    .map((segment) => {
      const { date, time } = parseDateAndTime(segment[0]);
      const linkIndex = segment.findIndex((line) => /\[[^\]]+\]\((https?:\/\/[^)\s]+|\/[^)\s]+)(?:\s+"[^"]*")?\)/.test(line));
      if (linkIndex < 0) return null;

      const linkLine = segment[linkIndex];
      const link = linkLine.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)(?:\s+"[^"]*")?\)/);
      if (!link) return null;

      const title = stripMarkdown(link[1]);
      const buyUrl = absolutizeUrl(link[2], baseUrl);
      const afterLink = segment.slice(linkIndex + 1).filter((line) => !looksLikeNoise(line));
      const price = extractPrice(afterLink);
      const venue = afterLink.find((line) => line !== price && !/\b(ARS|EUR|USD|free|gratis|\$)\b/i.test(line) && line.length <= 90);

      return {
        title,
        artist: deriveArtist(title),
        venue: venue ? stripMarkdown(venue) : null,
        date,
        time,
        price,
        description: venue ? `Concierto en ${stripMarkdown(venue)}.` : null,
        image_url: null,
        buy_url: buyUrl,
      } satisfies ScrapedEvent;
    })
    .filter((event): event is ScrapedEvent => Boolean(event?.title && event.date && event.buy_url));
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

        const url = new URL(request.url);
        const debug = url.searchParams.get("debug") === "1";

        const results: Record<
          string,
          { scraped: number; upserted: number; discarded: number; error?: string; sample?: string; parsedSample?: ScrapedEvent[] }
        > = {};

        for (const { key, source, url: sourceUrl, waitFor } of SOURCES) {
          try {
            const scrape = await firecrawl.scrape(sourceUrl, {
              formats: ["markdown"],
              onlyMainContent: true,
              ...(waitFor ? { waitFor } : {}),
              location: { country: "AR", languages: ["es"] },
            });

            const md =
              (scrape as { markdown?: string }).markdown ??
              (scrape as { data?: { markdown?: string } }).data?.markdown ??
              "";
            const events = parseEventsFromMarkdown(md, sourceUrl);

            if (debug) {
              results[key] = { scraped: events.length, upserted: 0, discarded: 0, sample: md.slice(0, 800), parsedSample: events.slice(0, 5) };
              continue;
            }

            const today = new Date().toISOString().slice(0, 10);
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
              .filter((r) => r.title && r.title.length > 0 && r.date && r.date >= today && r.lat != null && r.lng != null);

            if (rows.length > 0) {
              const { error } = await supabaseAdmin
                .from("concerts")
                .upsert(rows, { onConflict: "source,external_id" });
              if (error) throw error;
            }

            results[key] = { scraped: events.length, upserted: rows.length, discarded: events.length - rows.length };
          } catch (err) {
            console.error(`[ingest-concerts] ${key} failed`, err);
            results[key] = { scraped: 0, upserted: 0, discarded: 0, error: err instanceof Error ? err.message : String(err) };
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
