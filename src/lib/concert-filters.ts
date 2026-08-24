// Filtros de la home: búsqueda por texto, rangos de fecha con un toque y
// distancia al usuario. Todo son funciones puras sobre los conciertos que el
// loader ya trajo enteros al cliente, así que no hay query nueva detrás.
import type { Concert } from "@/data/concerts";

export type Coords = { lat: number; lng: number };

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Fecha local, no UTC. `toISOString()` da UTC y en Buenos Aires (UTC-3) eso ya
// es mañana a partir de las 21hs: "Hoy" marcaría el día equivocado toda la
// noche, justo cuando alguien busca a qué ir.
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export type PresetId = "hoy" | "finde" | "semana" | "mes";
export type DateRange = { from: string; to: string };

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "finde", label: "Este finde" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
];

export function presetRange(id: PresetId, now: Date = new Date()): DateRange {
  const today = toIsoDate(now);

  switch (id) {
    case "hoy":
      return { from: today, to: today };

    case "finde": {
      // 0 domingo … 6 sábado. Si el finde ya empezó, "este finde" es el que se
      // está viviendo y arranca hoy; de lunes a jueves es el que viene.
      const dow = now.getDay();
      if (dow === 0) return { from: today, to: today };
      if (dow === 6) return { from: today, to: addDays(today, 1) };
      const from = dow === 5 ? today : addDays(today, 5 - dow);
      return { from, to: addDays(from, 2) };
    }

    // "Esta semana" en el sentido en que se pregunta: los próximos siete días,
    // no lo que queda del calendario semanal (que un sábado sería un solo día).
    case "semana":
      return { from: today, to: addDays(today, 6) };

    case "mes":
      return { from: today, to: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
}

/** Qué chip corresponde iluminar para el rango actual, si es que alguno. */
export function activePreset(from: string, to: string, now: Date = new Date()): PresetId | null {
  if (!from && !to) return null;
  for (const { id } of PRESETS) {
    const range = presetRange(id, now);
    if (range.from === from && range.to === to) return id;
  }
  return null;
}

// Sin normalizar, "garcia" no encuentra a "Kany García" ni "niceto" a
// "Niceto Club": los nombres vienen scrapeados tal cual los escribe cada sitio.
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function matchesQuery(concert: Concert, query: string): boolean {
  const normalized = normalize(query);
  if (!normalized) return true;
  // Cada palabra por su cuenta: "duki movistar" tiene que encontrar el show
  // aunque el artista y el venue vivan en campos distintos.
  const haystack = normalize(`${concert.artist} ${concert.title} ${concert.venue}`);
  return normalized.split(/\s+/).every((word) => haystack.includes(word));
}

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine. Para distancias dentro de una ciudad sobra de precisión. */
export function distanceKm(from: Coords, to: Coords): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}
