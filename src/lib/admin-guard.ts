import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/** Lo que `requireSupabaseAuth` deja en el contexto y hace falta acá. */
type ContextoAutenticado = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/**
 * Corta la server fn si quien llama no es admin.
 *
 * Va con el cliente del usuario (el que lleva su bearer), no con el
 * service-role: el chequeo tiene que hacerlo Postgres contra la sesión real.
 * Recién después las funciones que la usan pasan al cliente admin para leer o
 * escribir lo que RLS no les dejaría.
 */
export async function exigirAdmin(context: ContextoAutenticado): Promise<void> {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden");
}
