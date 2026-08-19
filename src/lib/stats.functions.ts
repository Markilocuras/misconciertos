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

/** Un día de la serie temporal del panel. `acumulado` incluye lo anterior a la ventana. */
export type ClickPoint = {
  date: string;
  clicks: number;
  acumulado: number;
};

// Ventana del gráfico. Treinta días entran cómodos en el ancho de la tarjeta sin
// que las barras queden hilos.
const SERIES_DAYS = 30;

// clicked_at viene en UTC y el panel se lee desde acá: un clic de las 22 hs de
// Buenos Aires es UTC del día siguiente, así que los días se cortan en hora
// argentina o la serie queda corrida.
const AR_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Clics por día (hora argentina) de los últimos SERIES_DAYS días, con acumulado. */
function buildSeries(rows: Array<{ clicked_at: string }>): ClickPoint[] {
  const porDia = new Map<string, number>();
  for (const row of rows) {
    const dia = AR_DAY.format(new Date(row.clicked_at));
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }

  // El mediodía UTC evita que restar días caiga en otro día por el huso.
  const hoy = new Date(`${AR_DAY.format(new Date())}T12:00:00Z`);
  const dias: string[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setUTCDate(d.getUTCDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }

  // El acumulado arranca en lo que ya había antes de la ventana: la curva
  // muestra el total real, no un total que se reinicia cada mes.
  let acumulado = 0;
  for (const [dia, n] of porDia) {
    if (dia < dias[0]) acumulado += n;
  }

  return dias.map((date) => {
    const clicks = porDia.get(date) ?? 0;
    acumulado += clicks;
    return { date, clicks, acumulado };
  });
}

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
      const c = (row as { concerts: { title: string; venue: string; date: string } | null })
        .concerts;
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
    return { stats, total: data?.length ?? 0, series: buildSeries(data ?? []) };
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
