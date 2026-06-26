import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClickStat = {
  concert_id: string | null;
  title: string | null;
  venue: string | null;
  date: string | null;
  source: string | null;
  clicks: number;
  last_click: string | null;
};

export const getClickStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("concert_clicks")
      .select("concert_id, source, clicked_at, concerts(title, venue, date)")
      .order("clicked_at", { ascending: false })
      .limit(5000);

    if (error) throw new Error(error.message);

    const map = new Map<string, ClickStat>();
    for (const row of data ?? []) {
      const key = row.concert_id ?? `unknown:${row.source ?? ""}`;
      const c = (row as { concerts: { title: string; venue: string; date: string } | null }).concerts;
      const existing = map.get(key);
      if (existing) {
        existing.clicks += 1;
        if (!existing.last_click || row.clicked_at > existing.last_click) {
          existing.last_click = row.clicked_at;
        }
      } else {
        map.set(key, {
          concert_id: row.concert_id,
          title: c?.title ?? "(eliminado)",
          venue: c?.venue ?? null,
          date: c?.date ?? null,
          source: row.source,
          clicks: 1,
          last_click: row.clicked_at,
        });
      }
    }

    const stats = Array.from(map.values()).sort((a, b) => b.clicks - a.clicks);
    return { stats, total: data?.length ?? 0 };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) return { isAdmin: false };
    return { isAdmin: !!data };
  });
