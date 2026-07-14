// Parsers puros de las fuentes de conciertos. Sin dependencias de red ni de
// Supabase para poder testearlos con fixtures HTML/markdown descargados.

export type ScrapedEvent = {
  title: string;
  artist: string | null;
  venue: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  price: string | null;
  description: string | null;
  image_url: string | null;
  buy_url: string | null;
  locality: string | null; // ciudad según la fuente, si la publica
};

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

export function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const iso = input.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY (formato de Dale Play)
  const dmy = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function safeHttpUrl(input: string | null | undefined): string | null {
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

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveArtist(title: string): string | null {
  const separators = [" • ", " - ", " en ", " in "];
  for (const separator of separators) {
    const [first] = title.split(separator);
    if (first && first.length >= 2 && first.length < title.length) return first.trim();
  }
  return title;
}

// Slug URL-safe: minúsculas, sin acentos, no-alfanuméricos colapsados a "-".
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatArsPrice(amount: number): string {
  const rounded = Math.round(amount);
  const withDots = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `ARS ${withDots}`;
}

// ---------------------------------------------------------------------------
// allevents.in — listado en markdown de Firecrawl
// ---------------------------------------------------------------------------

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

function looksLikeDateLine(line: string): boolean {
  return /(?:mon|tue|wed|thu|fri|sat|sun|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\s*,?\s*\d{1,2}\s+[a-záéíóúñ]+/i.test(
    line,
  );
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
  const found = lines.find(
    (line) => /\b(ARS|EUR|USD|free|gratis|\$)\b/i.test(line) && line.length <= 80,
  );
  return found ? stripMarkdown(found.replace(/^[-*]\s*/, "")) : null;
}

function extractMarkdownImage(lines: string[]): string | null {
  for (const line of lines) {
    const img = line.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)/);
    if (img) return safeHttpUrl(img[1]);
  }
  return null;
}

export function parseAllEventsMarkdown(markdown: string, baseUrl: string): ScrapedEvent[] {
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

  const parsed: Array<ScrapedEvent | null> = segments.map((segment) => {
    const { date, time } = parseDateAndTime(segment[0]);
    const linkIndex = segment.findIndex((line) =>
      /\[[^\]]+\]\((https?:\/\/[^)\s]+|\/[^)\s]+)(?:\s+"[^"]*")?\)/.test(line),
    );
    if (linkIndex < 0) return null;

    const linkLine = segment[linkIndex];
    const link = linkLine.match(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)(?:\s+"[^"]*")?\)/,
    );
    if (!link) return null;

    const title = stripMarkdown(link[1]);
    const buyUrl = absolutizeUrl(link[2], baseUrl);
    const image = extractMarkdownImage(segment);
    const afterLink = segment.slice(linkIndex + 1).filter((line) => !looksLikeNoise(line));
    const price = extractPrice(afterLink);
    const venue = afterLink.find(
      (line) =>
        line !== price && !/\b(ARS|EUR|USD|free|gratis|\$)\b/i.test(line) && line.length <= 90,
    );

    return {
      title,
      artist: deriveArtist(title),
      venue: venue ? stripMarkdown(venue) : null,
      date,
      time,
      price,
      description: venue ? `Concierto en ${stripMarkdown(venue)}.` : null,
      image_url: image,
      buy_url: buyUrl,
      locality: null,
    } satisfies ScrapedEvent;
  });

  return parsed.filter((event): event is ScrapedEvent =>
    Boolean(event?.title && event.date && event.buy_url),
  );
}

// ---------------------------------------------------------------------------
// allaccess.com.ar — home con links /event/<slug>; cada evento publica JSON-LD
// ---------------------------------------------------------------------------

export function extractAllAccessEventLinks(html: string): string[] {
  const links = [
    ...html.matchAll(/href=["'](?:https:\/\/www\.allaccess\.com\.ar)?(\/event\/[^"'?#]+)["']/g),
  ].map((m) => `https://www.allaccess.com.ar${m[1]}`);
  return [...new Set(links)];
}

type JsonLdEvent = {
  "@type"?: string;
  name?: string;
  description?: string;
  startDate?: string;
  image?: string | string[] | null;
  url?: string;
  location?: {
    name?: string;
    address?: { addressLocality?: string };
  };
  offers?: Array<{ price?: number | string }>;
};

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks = [
    ...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1]);
  const parsed: unknown[] = [];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block.trim());
      parsed.push(...(Array.isArray(json) ? json : [json]));
    } catch {
      // bloque malformado: lo ignoramos
    }
  }
  return parsed;
}

function extractOgImage(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? safeHttpUrl(m[1]) : null;
}

export function parseAllAccessEventPage(html: string, pageUrl: string): ScrapedEvent | null {
  const items = extractJsonLdBlocks(html) as JsonLdEvent[];
  const ev = items.find((i) => i && /event/i.test(String(i["@type"] ?? "")));
  if (!ev?.name || !ev.startDate) return null;

  // Tomamos la parte de fecha/hora del string tal cual (las ticketeras suelen
  // publicar hora local aunque marquen "Z").
  const date = normalizeDate(ev.startDate);
  const timeMatch = ev.startDate.match(/T(\d{2}):(\d{2})/);
  const time = timeMatch && `${timeMatch[1]}:${timeMatch[2]}` !== "00:00"
    ? `${timeMatch[1]}:${timeMatch[2]}`
    : null;

  const prices = (ev.offers ?? [])
    .map((o) => Number(o.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  const price = prices.length ? formatArsPrice(Math.min(...prices)) : null;

  const jsonImage = Array.isArray(ev.image) ? ev.image[0] : ev.image;
  const image = safeHttpUrl(jsonImage ?? null) ?? extractOgImage(html);

  const venue = ev.location?.name ?? null;
  const title = decodeHtmlEntities(ev.name);

  return {
    title,
    artist: deriveArtist(title),
    venue,
    date,
    time,
    price,
    description:
      ev.description && ev.description !== ev.name
        ? decodeHtmlEntities(ev.description)
        : venue
          ? `Concierto en ${venue}.`
          : null,
    image_url: image,
    buy_url: safeHttpUrl(ev.url) ?? pageUrl,
    locality: ev.location?.address?.addressLocality ?? null,
  };
}

// ---------------------------------------------------------------------------
// daleplay.la/live-shows/live — cards HTML de WordPress
// ---------------------------------------------------------------------------

export function parseDalePlayLive(html: string): ScrapedEvent[] {
  const cards = html.split(/<div class="events__grid__item"/).slice(1);
  const events: ScrapedEvent[] = [];

  for (const card of cards) {
    const titleMatch = card.match(/events__grid__item__top__title[^>]*>\s*([^<]+?)\s*</);
    const imageMatch = card.match(
      /<img[^>]+class="events__grid__item__top__bg"[^>]+src="([^"]+)"/,
    );
    if (!titleMatch) continue;
    const artist = decodeHtmlEntities(titleMatch[1]);
    const image = imageMatch ? safeHttpUrl(imageMatch[1]) : null;

    const shows = card.split(/class="events__grid__item__bottom__event"/).slice(1);
    for (const show of shows) {
      const dateMatch = show.match(/__event__date[\s\S]*?<\/svg>\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
      const locationMatch = show.match(/__event__location[^>]*>[\s\S]*?<\/div>\s*([^<]+?)\s*</);
      const linkMatch = show.match(/<a href="([^"]+)"[^>]*class="[^"]*__event__link/);
      if (!dateMatch || !locationMatch || !linkMatch) continue;

      const location = decodeHtmlEntities(locationMatch[1]);
      const dashIndex = location.lastIndexOf(" - ");
      const venue = dashIndex > 0 ? location.slice(0, dashIndex).trim() : location;
      const locality = dashIndex > 0 ? location.slice(dashIndex + 3).trim() : null;

      events.push({
        title: artist,
        artist,
        venue,
        date: normalizeDate(dateMatch[1]),
        time: null,
        price: null,
        description: `Concierto en ${venue}.`,
        image_url: image,
        buy_url: safeHttpUrl(linkMatch[1]),
        locality,
      });
    }
  }

  return events.filter((e) => e.title && e.date && e.buy_url);
}
