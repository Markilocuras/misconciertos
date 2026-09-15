import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * La cola de revisión: lo que la ingesta marcó como dudoso y no publicó.
 *
 * Existe porque el filtro de lo no-musical es un colador y siempre lo va a ser:
 * agarra lo que se nombra a sí mismo y no puede agarrar lo que no. Antes eso
 * obligaba a que cada término fuera conservador —un falso positivo costaba un
 * recital— así que se colaban la Copa Libertadores y las visitas guiadas, y
 * había que ir a borrarlas a mano de la base.
 *
 * Con esta cola, equivocarse cuesta un clic. Por eso el filtro de sospecha
 * puede ser mucho más amplio que el de descarte.
 */
export type EnRevision = {
  id: string;
  title: string;
  artist: string | null;
  venue: string | null;
  date: string | null;
  source: string;
  buy_url: string | null;
};

async function exigirAdmin(context: { supabase: { rpc: RpcFn }; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden");
}

type RpcFn = (
  name: "has_role",
  args: { _user_id: string; _role: string },
) => Promise<{ data: boolean | null; error: { message: string } | null }>;

export const listPendingReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context as never);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("concerts")
      .select("id, title, artist, venue, date, source, buy_url")
      .eq("review_status", "pendiente")
      .order("date", { ascending: true });

    if (error) throw new Error(error.message);
    return { pendientes: (data ?? []) as EnRevision[] };
  });

export const resolveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown): { id: string; decision: "aprobado" | "rechazado" } => {
    const o = input as { id?: unknown; decision?: unknown };
    if (typeof o?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(o.id)) throw new Error("id inválido");
    if (o.decision !== "aprobado" && o.decision !== "rechazado") {
      throw new Error("decisión inválida");
    }
    return { id: o.id, decision: o.decision };
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(context as never);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Solo se resuelve lo que está pendiente: si dos pestañas abiertas deciden
    // sobre la misma fila, la segunda no pisa a la primera.
    const { error } = await supabaseAdmin
      .from("concerts")
      .update({ review_status: data.decision })
      .eq("id", data.id)
      .eq("review_status", "pendiente");

    if (error) throw new Error(error.message);
    return { ok: true };
  });
