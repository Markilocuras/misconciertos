// El recordatorio del día anterior a un show, por notificación y por mail.
//
// Vive acá y no adentro del handler porque lo disparan dos cosas: el Cron
// Trigger de Cloudflare (`src/tasks/recordatorios.ts`, que es el camino normal)
// y la ruta `?recordatorios=1` del hook de ingesta, que queda para correrlo a
// mano sin esperar a la madrugada. Los dos tienen que hacer exactamente lo
// mismo, así que hacen exactamente lo mismo: llaman a esta función.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendShowReminderEmails,
  type DigestConcert,
  type RecordatorioMail,
} from "@/lib/email.server";
import { agruparRecordatorios, sendShowReminders } from "@/lib/push.server";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "@/lib/site";
import { tomorrowInBuenosAires } from "@/lib/timezone";

const COLUMNAS = "id, title, artist, venue, date, time, slug";

export type ResumenRecordatorios = {
  /** El día cuyos shows se avisaron, en hora de Buenos Aires. */
  manana: string;
  push: {
    suscripciones: number;
    dispositivos: number;
    sent: number;
    failed: number;
    borradas: number;
    marcadas: number;
    error?: string;
  };
  mail: {
    suscripciones: number;
    destinatarios: number;
    sent: number;
    failed: number;
    marcadas: number;
    error?: string;
  };
};

/**
 * Manda los recordatorios de los shows de mañana y marca lo que salió bien.
 *
 * Sobre la ventana: el pedido original era "shows dentro de 24-48hs", y eso es
 * lo que esto hace, pero expresado como una fecha y no como un rango de horas.
 * El motivo es el esquema: `concerts.date` es una fecha y `concerts.time` es
 * texto y puede ser NULL, así que no hay un timestamp contra el cual comparar
 * —un show sin hora no cae en ningún rango—. Corriendo de mañana, "los shows de
 * mañana" son justamente los que están a entre 24 y 48 horas, y además es
 * determinístico: no depende de a qué hora arrancó la corrida.
 *
 * No lanza. Se la llama desde un Cron Trigger donde nadie está mirando, y un
 * push service caído no puede dejar el resto sin mandar.
 */
export async function enviarRecordatorios(ahora: Date = new Date()): Promise<ResumenRecordatorios> {
  const manana = tomorrowInBuenosAires(ahora);

  // --- Por notificación ---------------------------------------------------
  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("push_subscriptions")
    .select(`id, endpoint, p256dh, auth, concerts!inner(${COLUMNAS})`)
    .not("concert_id", "is", null)
    .is("reminded_at", null)
    .eq("concerts.date", manana);
  // Una consulta que falla y un día sin suscriptos devuelven las mismas cifras
  // en cero. Corriendo desde un Cron Trigger no hay respuesta HTTP que nadie
  // mire, así que si la diferencia no está en el resumen no está en ningún
  // lado: es el mismo problema que `found` vs `scraped` en la ingesta.
  if (subsErr) console.error("[recordatorios] leer suscripciones push", subsErr);

  const pares = (subs ?? []).map((s) => ({
    sub: { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
    concierto: s.concerts as unknown as DigestConcert,
  }));
  const agrupados = agruparRecordatorios(pares);

  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const push =
    agrupados.length > 0 && privateKey
      ? await sendShowReminders(agrupados, {
          publicKey: VAPID_PUBLIC_KEY,
          privateKey,
          subject: VAPID_SUBJECT,
        })
      : { sent: 0, failed: 0, expiradas: [] as string[] };

  // Las que contestaron 404/410 ya no existen del lado del navegador: borrarlas
  // es la única forma en que esta tabla se limpia sola.
  let borradas = 0;
  if (push.expiradas.length > 0) {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .in("endpoint", push.expiradas);
    if (error) console.error("[recordatorios] limpiar expiradas", error);
    else borradas = push.expiradas.length;
  }

  // Se marca sólo si no falló ningún envío: un problema hoy reintenta mañana en
  // vez de perder el aviso. Una suscripción expirada no cuenta como falla —es
  // una baja—, así que un teléfono viejo no bloquea al resto.
  let marcadasPush = 0;
  if (push.failed === 0 && (subs ?? []).length > 0) {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .update({ reminded_at: ahora.toISOString() })
      .in(
        "id",
        (subs ?? []).map((s) => s.id),
      );
    if (error) console.error("[recordatorios] marcar push", error);
    else marcadasPush = (subs ?? []).length;
  }

  // --- Por mail -----------------------------------------------------------
  const { data: porMail, error: mailErr } = await supabaseAdmin
    .from("show_email_reminders")
    .select(`id, email, unsubscribe_token, concerts!inner(${COLUMNAS})`)
    .is("reminded_at", null)
    .eq("concerts.date", manana);
  if (mailErr) console.error("[recordatorios] leer suscripciones mail", mailErr);

  // Un mail por persona, aunque siga dos shows de mañana.
  const porDireccion = new Map<string, RecordatorioMail>();
  for (const r of porMail ?? []) {
    const concierto = r.concerts as unknown as DigestConcert;
    const ya = porDireccion.get(r.email);
    if (ya) ya.conciertos.push(concierto);
    else
      porDireccion.set(r.email, {
        email: r.email,
        unsubscribe_token: r.unsubscribe_token,
        conciertos: [concierto],
      });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const mail =
    porDireccion.size > 0 && apiKey
      ? await sendShowReminderEmails(apiKey, [...porDireccion.values()])
      : { sent: 0, failed: 0 };

  let marcadasMail = 0;
  if (mail.failed === 0 && (porMail ?? []).length > 0) {
    const { error } = await supabaseAdmin
      .from("show_email_reminders")
      .update({ reminded_at: ahora.toISOString() })
      .in(
        "id",
        (porMail ?? []).map((r) => r.id),
      );
    if (error) console.error("[recordatorios] marcar mail", error);
    else marcadasMail = (porMail ?? []).length;
  }

  // Una consulta rota es peor que una clave sin configurar, así que gana ella:
  // sin suscripciones no hay nada que mandar y la clave da igual.
  const errorPush =
    subsErr?.message ?? push.error ?? (privateKey ? undefined : "VAPID_PRIVATE_KEY not set");
  const errorMail =
    mailErr?.message ?? mail.error ?? (apiKey ? undefined : "RESEND_API_KEY not set");

  return {
    manana,
    push: {
      suscripciones: (subs ?? []).length,
      dispositivos: agrupados.length,
      sent: push.sent,
      failed: push.failed,
      borradas,
      marcadas: marcadasPush,
      ...(errorPush ? { error: errorPush } : {}),
    },
    mail: {
      suscripciones: (porMail ?? []).length,
      destinatarios: porDireccion.size,
      sent: mail.sent,
      failed: mail.failed,
      marcadas: marcadasMail,
      ...(errorMail ? { error: errorMail } : {}),
    },
  };
}
