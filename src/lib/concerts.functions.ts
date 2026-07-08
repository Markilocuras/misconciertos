import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ConcertRow = {
  id: string;
  source: string;
  external_id: string;
  title: string;
  artist: string | null;
  venue: string | null;
  date: string | null;
  time: string | null;
  price: string | null;
  description: string | null;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  buy_url: string | null;
};

export const listConcerts = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("concerts")
    .select(
      "id, source, external_id, title, artist, venue, date, time, price, description, image_url, lat, lng, buy_url",
    )
    .gte("date", today)
    .neq("source", "seed")
    .order("date", { ascending: true });

  if (error) {
    console.error("[listConcerts] supabase error", error);
    return { concerts: [] as ConcertRow[], error: error.message };
  }
  return { concerts: (data ?? []) as ConcertRow[] };
});
