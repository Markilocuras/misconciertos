import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirAdmin } from "@/lib/admin-guard";
import {
  contarPersonas,
  resumirAvisosDeArtista,
  resumirRecordatoriosDeShow,
  type ArtistaSeguido,
  type FilaRecordatorioShow,
  type ShowSeguido,
} from "@/lib/suscripciones";

export type { ArtistaSeguido, ShowSeguido };

export type ResumenSuscripciones = {
  /**
   * Mails distintos entre las tres listas: cuánta gente hay, no cuántas filas.
   * Del resumen diario sólo entran las cuentas confirmadas, que son las únicas
   * de las que se puede saber la dirección.
   */
  personas: number;
  /** Suma de suscripciones (una persona puede seguir cinco artistas y tres shows). */
  suscripciones: number;
  digest: {
    /** Filas en la tabla, confirmadas o no. */
    total: number;
    /**
     * Las direcciones que efectivamente reciben el mail. Son sólo las
     * confirmadas: la de una cuenta sin verificar vive en `auth.users` y la
     * función que hace de puente la filtra, justamente porque no se le escribe.
     * Su largo es cuántas son.
     */
    emails: string[];
  };
  artistas: ArtistaSeguido[];
  shows: ShowSeguido[];
};

/**
 * Los números de quién dejó su mail y para qué.
 *
 * Las tres tablas son PII y ninguna se lee sin ser admin: las políticas de
 * `artist_alerts` y `show_email_reminders` ya limitan el SELECT a `has_role`,
 * y esto sale por el cliente service-role detrás del mismo chequeo.
 *
 * Las direcciones viajan con el resumen en vez de pedirse al abrir cada fila.
 * Con estas listas —decenas, y el techo diario de Resend las deja en ~90— es
 * una consulta menos y ninguna espera al desplegar. Si alguna vez son miles,
 * esto pasa a ser un server fn aparte por grupo.
 *
 * Los avisos por push no entran acá: son el mismo producto por otro canal, pero
 * lo que identifica a un suscripto es distinto (un mail es una persona, un
 * endpoint es un navegador) y sumarlos daría un número que no es ni gente ni
 * dispositivos.
 */
export const getSubscriptionStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumenSuscripciones> => {
    await exigirAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [alertas, recordatorios, digest, destinatarios] = await Promise.all([
      supabaseAdmin.from("artist_alerts").select("artist, email, created_at"),
      supabaseAdmin
        .from("show_email_reminders")
        .select("concert_id, email, created_at, reminded_at, concerts(title, venue, date, slug)"),
      supabaseAdmin
        .from("concert_digest_subscriptions")
        .select("user_id", { count: "exact", head: true }),
      // Los mails del resumen viven en auth.users, que PostgREST no expone:
      // esta función es el único puente y ya filtra los sin confirmar, que son
      // justamente los que no reciben nada.
      supabaseAdmin.rpc("list_concert_digest_recipients"),
    ]);

    if (alertas.error) throw new Error(alertas.error.message);
    if (recordatorios.error) throw new Error(recordatorios.error.message);
    if (digest.error) throw new Error(digest.error.message);
    if (destinatarios.error) throw new Error(destinatarios.error.message);

    const filasAlertas = alertas.data ?? [];
    const filasRecordatorios = (recordatorios.data ?? []) as unknown as FilaRecordatorioShow[];
    const mailsDigest = (destinatarios.data ?? []).map((d) => d.email);

    return {
      personas: contarPersonas(
        filasAlertas.map((f) => f.email),
        filasRecordatorios.map((f) => f.email),
        mailsDigest,
      ),
      suscripciones: filasAlertas.length + filasRecordatorios.length + (digest.count ?? 0),
      digest: { total: digest.count ?? 0, emails: mailsDigest.sort((a, b) => a.localeCompare(b)) },
      artistas: resumirAvisosDeArtista(filasAlertas),
      shows: resumirRecordatoriosDeShow(filasRecordatorios),
    };
  });
