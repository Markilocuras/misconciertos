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
  // Live Pass publica la coordenada del venue en su JSON-LD. Cuando viene, es
  // mejor que VENUE_COORDS: no depende de que alguien haya cargado el lugar a
  // mano, así que funciona con salas que la tabla no conoce.
  lat?: number | null;
  lng?: number | null;
  region?: string | null; // provincia según la fuente, si la publica
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
// allevents.in — listado HTML. Antes esto pasaba por Firecrawl porque se creía
// que el listado se armaba en el cliente, pero allevents sirve las cards ya
// renderizadas: alcanza con un fetch por listado y se ahorra la dependencia
// (y la API key, que nunca llegó a estar configurada).
// ---------------------------------------------------------------------------

// "Thu, 03 Sep, 2026 - 07:00 PM", y también "Thu, 10 Sep • 07:00 PM + 1 more",
// que viene sin año.
function parseAllEventsDateTime(
  input: string,
  now: Date,
): { date: string | null; time: string | null } {
  const dm = input.match(/(\d{1,2})\s+([a-záéíóúñ]{3,})\.?,?\s*(\d{4})?/i);
  if (!dm) return { date: null, time: null };
  const month = MONTHS[dm[2].toLowerCase()];
  if (!month) return { date: null, time: null };

  let year = dm[3] ? Number(dm[3]) : now.getUTCFullYear();
  // Sin año explícito la fecha siempre es la próxima vez que cae ese día:
  // allevents no lista shows pasados, así que un mes ya vencido es del año que
  // viene. Sin esto, en diciembre todo enero entraría con fecha pasada y se
  // descartaría entero.
  if (!dm[3] && month < now.getUTCMonth() + 1) year += 1;

  const tm = input.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  let time: string | null = null;
  if (tm) {
    let hour = Number(tm[1]);
    const meridiem = tm[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    time = `${String(hour).padStart(2, "0")}:${tm[2]}`;
  }

  return { date: toIsoDate(year, month, Number(dm[1])), time };
}

export function parseAllEventsListing(html: string, now: Date = new Date()): ScrapedEvent[] {
  const cards = html.split('class="event-card event-card-link"').slice(1);
  const events: ScrapedEvent[] = [];

  for (const card of cards) {
    const linkMatch = card.match(/data-link="([^"]+)"/);
    const titleMatch = card.match(/<h3>\s*([\s\S]*?)\s*<\/h3>/);
    const dateMatch = card.match(/class="date"[^>]*>\s*([^<]+?)\s*<\/div>/);
    if (!linkMatch || !titleMatch || !dateMatch) continue;

    const venueMatch = card.match(/class="location[^"]*"[^>]*>\s*([^<]+?)\s*<\/div>/);
    // Las cards de arriba traen la imagen inline; las que entran por debajo del
    // fold vienen lazy y la dejan en data-src.
    const imageMatch =
      card.match(/class="banner-cont[^"]*"[^>]*background:url\(([^)]+)\)/) ??
      card.match(/class="banner-cont[^"]*"[^>]*data-src="([^"]+)"/);

    const title = decodeHtmlEntities(titleMatch[1]);
    const venue = venueMatch ? decodeHtmlEntities(venueMatch[1]) : null;
    const { date, time } = parseAllEventsDateTime(dateMatch[1], now);

    events.push({
      title,
      artist: deriveArtist(title),
      venue,
      date,
      time,
      price: null,
      description: venue ? `Concierto en ${venue}.` : null,
      image_url: imageMatch ? safeHttpUrl(imageMatch[1]) : null,
      buy_url: safeHttpUrl(linkMatch[1]),
      locality: null,
    });
  }

  return events.filter((e) => e.title && e.date && e.buy_url);
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
    address?: { addressLocality?: string; addressRegion?: string };
    geo?: { latitude?: string | number; longitude?: string | number };
  };
  // schema.org permite una oferta o varias, y las fuentes usan las dos: All
  // Access manda una lista de Offer y Live Pass un AggregateOffer suelto.
  offers?: { price?: number | string } | Array<{ price?: number | string }>;
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

function comoLista<T>(input: T | T[] | null | undefined): T[] {
  if (input == null) return [];
  return Array.isArray(input) ? input : [input];
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
  const time =
    timeMatch && `${timeMatch[1]}:${timeMatch[2]}` !== "00:00"
      ? `${timeMatch[1]}:${timeMatch[2]}`
      : null;

  const prices = comoLista(ev.offers)
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
    const imageMatch = card.match(/<img[^>]+class="events__grid__item__top__bg"[^>]+src="([^"]+)"/);
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

// ---------------------------------------------------------------------------
// ticketek.com.ar — SPA de Angular; los datos salen de su API CMS en JSON.
// La URL de la API lleva el querystring percent-encodeado dentro del path y
// usa "--" en lugar de "/" para rutas anidadas (así lo llama su propio front).
// ---------------------------------------------------------------------------

export const TICKETEK_API_BASE = "https://prod-cms-api.ticketek.com.ar/api/1.0/node%3Fpath%3D";
export const TICKETEK_SITE = "https://www.ticketek.com.ar";

export function ticketekApiUrl(path: string): string {
  return TICKETEK_API_BASE + path.replace(/\//g, "--");
}

function httpsImage(input: unknown): string | null {
  if (typeof input !== "string" || !input) return null;
  return safeHttpUrl(input.startsWith("//") ? `https:${input}` : input);
}

type UnknownRecord = Record<string, unknown>;

function collectByType(root: unknown, type: string, out: UnknownRecord[] = []): UnknownRecord[] {
  if (Array.isArray(root)) {
    for (const item of root) collectByType(item, type, out);
    return out;
  }
  if (root && typeof root === "object") {
    const record = root as UnknownRecord;
    if (record.type === type) out.push(record);
    for (const value of Object.values(record)) collectByType(value, type, out);
  }
  return out;
}

export type TicketekListItem = {
  name: string;
  url: string;
  venue: string | null;
  state: string | null;
  image: string | null;
};

export function parseTicketekMusicList(json: unknown): TicketekListItem[] {
  const widgets = (json as UnknownRecord | null)?.widgets;
  const items = collectByType(widgets, "tkt-artist-list-item");
  const seen = new Set<string>();
  const out: TicketekListItem[] = [];
  for (const item of items) {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!name || !url || seen.has(url)) continue;
    seen.add(url);
    const venue = (item.venue ?? null) as UnknownRecord | null;
    out.push({
      name,
      url,
      venue: typeof venue?.title === "string" ? venue.title : null,
      state: typeof venue?.state === "string" ? venue.state : null,
      image: httpsImage(item.image),
    });
  }
  return out;
}

export type TicketekArtistShow = {
  link: string;
  venue: string | null;
  locality: string | null;
  image: string | null;
};

export function parseTicketekArtistShows(json: unknown): TicketekArtistShow[] {
  const widgets = (json as UnknownRecord | null)?.widgets;
  const items = collectByType(widgets, "tkt-artist-shows-item");
  const out: TicketekArtistShow[] = [];
  for (const item of items) {
    const link = typeof item.link === "string" ? item.link.trim() : "";
    if (!link) continue;
    out.push({
      link,
      venue: typeof item["venue-title"] === "string" ? (item["venue-title"] as string) : null,
      locality:
        typeof item["venue-locality"] === "string" ? (item["venue-locality"] as string) : null,
      image: httpsImage(item.image),
    });
  }
  return out;
}

export type TicketekPerformance = {
  date: string; // YYYY-MM-DD (hora de Buenos Aires)
  time: string | null;
  price: string | null;
};

// Los timestamps de Ticketek ya vienen en hora argentina "disfrazada" de UTC
// (verificado contra date_display: 1792875600 → "Sabado 24 Octubre 21Hs"),
// así que se leen los componentes UTC tal cual, sin corrimiento.
function unixToArDateTime(ts: number): { date: string; time: string | null } {
  const iso = new Date(ts * 1000).toISOString();
  const time = iso.slice(11, 16);
  return { date: iso.slice(0, 10), time: time === "00:00" ? null : time };
}

function parsePriceNumber(input: unknown): number | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const n = Number(String(input).replace(/\./g, "").replace(/,/g, "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseTicketekShow(json: unknown): TicketekPerformance[] {
  const widgets = (json as UnknownRecord | null)?.widgets;
  // Cada función es un objeto con perf_id + date (unix) + price_types.
  const perfs: UnknownRecord[] = [];
  (function walk(node: unknown) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const record = node as UnknownRecord;
      if (typeof record.perf_id === "number" && typeof record.date === "number") {
        perfs.push(record);
      }
      Object.values(record).forEach(walk);
    }
  })(widgets);

  return perfs.map((perf) => {
    const { date, time } = unixToArDateTime(perf.date as number);
    const available: number[] = [];
    const all: number[] = [];
    (function collectPrices(node: unknown) {
      if (Array.isArray(node)) return node.forEach(collectPrices);
      if (node && typeof node === "object") {
        const record = node as UnknownRecord;
        if ("pc_id" in record) {
          const price = parsePriceNumber(record.price);
          if (price) {
            all.push(price);
            if (record.availability === "AVAILABLE") available.push(price);
          }
        }
        Object.values(record).forEach(collectPrices);
      }
    })(perf.price_types);
    const min = available.length ? Math.min(...available) : all.length ? Math.min(...all) : null;
    return { date, time, price: min ? formatArsPrice(min) : null };
  });
}

// ---------------------------------------------------------------------------
// livepass.com.ar — el listado sirve solo links y fechas (el título viene
// truncado y no dice el lugar), pero cada página de evento publica un JSON-LD
// completo: nombre, fecha con hora, venue, localidad, provincia y coordenadas.
// ---------------------------------------------------------------------------

const LIVEPASS_SITE = "https://livepass.com.ar";

export function parseLivePassEventLinks(html: string): string[] {
  const links: string[] = [];
  const vistos = new Set<string>();
  for (const m of html.matchAll(/href="(\/events\/[^"#?]+)"/g)) {
    const url = LIVEPASS_SITE + m[1];
    if (vistos.has(url)) continue;
    vistos.add(url);
    links.push(url);
  }
  return links;
}

function sinAcentos(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Si la provincia que publica la fuente es Buenos Aires (provincia o ciudad).
 * Live Pass vende en todo el país y el mapa es de Buenos Aires, así que sin
 * este filtro entran shows de Córdoba, Neuquén o Mendoza.
 *
 * Escribe la misma provincia de tres formas distintas —"Buenos Aires",
 * "Provincia de Buenos Aires" y "Ciudad Autónoma de Buenos Aires"— y ninguna
 * distingue CABA de provincia de manera confiable: hay eventos de La Plata
 * marcados como "Buenos Aires" a secas. Por eso se aceptan las dos.
 */
export function isBuenosAiresRegion(region: string | null | undefined): boolean {
  if (!region) return false;
  const r = sinAcentos(region);
  if (/\b(caba|capital federal)\b/.test(r)) return true;
  return r.includes("buenos aires");
}

// Live Pass manda los títulos de evento con los caracteres especiales pisados
// por "?": publica "A PERFECT CIRCLE + PUSCIFER?en Buenos Aires" y
// "Giant Rooks?en Vorterix". Es un defecto de ellos —los nombres de venue del
// mismo JSON-LD vienen con los acentos bien— pero nos rompe deriveArtist, que
// corta por " en " con espacios: sin limpiar, el artista termina siendo el
// título entero.
//
// Un "?" de verdad va seguido de espacio o cierra el texto. Uno pegado a la
// palabra siguiente es basura, y se cambia por el espacio que le falta.
function limpiarInterrogantesRotos(title: string): string {
  return title
    .replace(/\?(?=\S)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Si el título delata que el evento no es musical.
 *
 * Live Pass no publica la categoría en ningún lado: no está en el JSON-LD, no
 * hay breadcrumb, y sus taxons agrupan por venue y no por género (`/taxons/
 * teatro` resultó ser casi todo Café Berlín, que es música). Así que lo único
 * que queda es leer el título.
 *
 * Esto es un colador, no un filtro: agarra lo que se nombra a sí mismo —una
 * lectura, un stand-up, un ballet— y no puede agarrar lo que no. "AUTOS ROBADOS
 * en el Teatro Opera LP" es una obra de teatro y por el título es idéntica a un
 * recital. Sobre las 76 fechas porteñas que Live Pass publica hoy, esto baja los
 * no-musicales de unos nueve a unos cuatro.
 *
 * Los términos son deliberadamente pocos y específicos. Un falso positivo acá
 * cuesta un recital que no entra al mapa, que es peor que un intruso que sí
 * entra: por eso no están "fiesta", "show" ni "espectáculo", que aparecen tanto
 * en eventos musicales como en los otros.
 */
const TERMINOS_NO_MUSICALES = [
  "stand up",
  "stand-up",
  "standup",
  "lectura",
  "ballet",
  "conferencia",
  "masterclass",
  "seminario",
  "obra de teatro",
  "teatro leido",
  "programas de",
];

/**
 * Eventos puntuales de Live Pass que no son musicales y que el título no delata.
 *
 * Es una lista a mano, y esta vez es la herramienta correcta: son producciones
 * concretas —una obra, una despedida de ballet— que ninguna regla automática
 * puede distinguir de un recital, porque la diferencia no está escrita en
 * ningún lado del HTML.
 *
 * Va por slug y no por título por dos motivos: una misma obra vuelve con varias
 * fechas y todas comparten el slug base, y el slug no cambia si le retocan el
 * título.
 *
 * Importa que exista aparte del filtro por palabras: borrar la fila de la base
 * no alcanza para sacar un evento del mapa. La ingesta arma su lista de
 * "conocidos" leyendo la base, así que al borrar una fila el link vuelve a
 * contar como nuevo y la corrida siguiente lo levanta de nuevo. Sin esta lista,
 * borrar es tirar agua al mar.
 */
const SLUGS_NO_MUSICALES = [
  "autos-robados",
  "inaki-urlezaga",
  "hecatombe-mi-primera-guerra-mundial",
];

export function esSlugBloqueado(url: string): boolean {
  const u = url.toLowerCase();
  return SLUGS_NO_MUSICALES.some((slug) => u.includes(slug));
}

export function pareceNoMusical(title: string): boolean {
  const t = sinAcentos(title);
  return TERMINOS_NO_MUSICALES.some((termino) => t.includes(termino));
}

function coordenada(input: unknown): number | null {
  const n = typeof input === "string" ? Number(input) : typeof input === "number" ? input : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseLivePassEventPage(html: string, pageUrl: string): ScrapedEvent | null {
  const items = extractJsonLdBlocks(html) as JsonLdEvent[];
  const ev = items.find((i) => i && /event/i.test(String(i["@type"] ?? "")));
  if (!ev?.name || !ev.startDate) return null;

  const date = normalizeDate(ev.startDate);
  const timeMatch = ev.startDate.match(/T(\d{2}):(\d{2})/);
  const time =
    timeMatch && `${timeMatch[1]}:${timeMatch[2]}` !== "00:00"
      ? `${timeMatch[1]}:${timeMatch[2]}`
      : null;

  const prices = comoLista(ev.offers)
    .map((o) => Number(o.price))
    .filter((p) => Number.isFinite(p) && p > 0);

  const jsonImage = Array.isArray(ev.image) ? ev.image[0] : ev.image;
  const venue = ev.location?.name ?? null;
  const title = limpiarInterrogantesRotos(decodeHtmlEntities(ev.name));

  return {
    title,
    artist: deriveArtist(title),
    venue,
    date,
    time,
    price: prices.length ? formatArsPrice(Math.min(...prices)) : null,
    description:
      ev.description && ev.description !== ev.name
        ? decodeHtmlEntities(ev.description)
        : venue
          ? `Concierto en ${venue}.`
          : null,
    image_url: safeHttpUrl(jsonImage ?? null) ?? extractOgImage(html),
    buy_url: safeHttpUrl(ev.url) ?? pageUrl,
    locality: ev.location?.address?.addressLocality ?? null,
    lat: coordenada(ev.location?.geo?.latitude),
    lng: coordenada(ev.location?.geo?.longitude),
    region: ev.location?.address?.addressRegion ?? null,
  };
}
