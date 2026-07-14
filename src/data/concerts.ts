import type { ConcertRow } from "@/lib/concerts.functions";

export type Concert = {
  id: string;
  title: string;
  artist: string;
  venue: string;
  date: string; // ISO yyyy-mm-dd
  time: string;
  price: string;
  description: string;
  image: string;
  lat: number;
  lng: number;
  buyUrl: string;
  slug: string;
  source?: string;
};

export const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800",
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800",
  "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800",
  "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800",
  "https://images.unsplash.com/photo-1587731556938-38755b4803a6?w=800",
  "https://images.unsplash.com/photo-1471478331149-c72f17e33c73?w=800",
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function toConcert(c: ConcertRow): Concert | null {
  if (c.lat == null || c.lng == null || c.date == null) return null;
  return {
    id: c.id,
    title: c.title,
    artist: c.artist ?? "",
    venue: c.venue ?? "",
    date: c.date,
    time: c.time ?? "",
    price: c.price ?? "",
    description: c.description ?? "",
    image: c.image_url ?? FALLBACK_IMAGES[hashId(c.id) % FALLBACK_IMAGES.length],
    lat: c.lat,
    lng: c.lng,
    buyUrl: c.buy_url ?? "#",
    slug: c.slug ?? "",
    source: c.source,
  };
}

export function formatConcertDate(date: string): string {
  return new Date(date + "T00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
