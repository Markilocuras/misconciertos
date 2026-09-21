import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "@/lib/admin-guard";

/**
 * La moderación de los comentarios de artista.
 *
 * Los comentarios son públicos y los escribe cualquiera con cuenta, así que
 * alguna vez va a entrar algo que no corresponde. Hasta que existió este panel
 * no había forma de sacarlo desde la app: `artist_comments` no tiene política
 * ni grant de DELETE para nadie —tampoco para el autor— y la única salida era
 * abrir la base a mano.
 *
 * Eliminar acá marca `deleted_at` en vez de borrar la fila. Lo que esconde el
 * comentario de verdad es la política de SELECT, que desde
 * 20260920190000_moderar_comentarios.sql pide `deleted_at is null`: si se
 * filtrara sólo en el cliente, la fila seguiría saliendo por PostgREST con la
 * anon key y "borrado" sería nada más que invisible en la ficha.
 */
export type ComentarioModerable = {
  id: string;
  artist: string;
  body: string;
  created_at: string;
  /** Null es visible. Con fecha, ya lo sacaste. */
  deleted_at: string | null;
  autor: string | null;
};

// La tabla es chica y se lee entera de una. El tope está para que el día que
// no lo sea el panel siga abriendo, aunque quede corto.
const LIMITE = 500;

type FilaConPerfil = {
  id: string;
  artist: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  profiles: { username: string } | null;
};

export const listComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Con el cliente admin, que no pasa por RLS: el panel tiene que ver también
    // los ya eliminados, que es lo único que hace posible deshacer.
    const { data, error } = await supabaseAdmin
      .from("artist_comments")
      .select("id, artist, body, created_at, deleted_at, profiles(username)")
      .order("created_at", { ascending: false })
      .limit(LIMITE);

    if (error) throw new Error(error.message);

    const comentarios: ComentarioModerable[] = ((data ?? []) as unknown as FilaConPerfil[]).map(
      (row) => ({
        id: row.id,
        artist: row.artist,
        body: row.body,
        created_at: row.created_at,
        deleted_at: row.deleted_at,
        autor: row.profiles?.username ?? null,
      }),
    );

    return { comentarios };
  });

export const moderateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown): { id: string; accion: "eliminar" | "restaurar" } => {
    const o = input as { id?: unknown; accion?: unknown };
    if (typeof o?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(o.id)) throw new Error("id inválido");
    if (o.accion !== "eliminar" && o.accion !== "restaurar") throw new Error("acción inválida");
    return { id: o.id, accion: o.accion };
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Quién lo sacó queda anotado: son varios los que pueden ser admin y sin
    // eso un comentario que falta no tiene explicación.
    const { error } = await supabaseAdmin
      .from("artist_comments")
      .update(
        data.accion === "eliminar"
          ? { deleted_at: new Date().toISOString(), deleted_by: context.userId }
          : { deleted_at: null, deleted_by: null },
      )
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
