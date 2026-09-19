// Qué dice cada aviso por push, y a quién le llega.
//
// El transporte está en web-push.server.ts; acá está la parte que se puede
// mirar y discutir sin saber nada de criptografía. Mismo reparto que
// email.server.ts, que tiene el envío y el texto separados por la misma razón.
//
// Va un aviso por dispositivo y no uno por artista: alguien anotado a tres
// artistas que anuncian el mismo día recibe una notificación, no tres. Es la
// misma decisión que ya tomó el mail, y en un teléfono importa más.
import { SITE_URL } from "@/lib/site";
import type { DigestConcert } from "@/lib/email.server";
import {
  sendPushBatch,
  type BatchResult,
  type VapidKeys,
  type WebPushSubscription,
} from "@/lib/web-push.server";

/** Una fila de `push_subscriptions`: el dispositivo y a qué artista sigue. */
export type SuscripcionPush = WebPushSubscription & { artist: string };

export type AvisoPush = {
  sub: WebPushSubscription;
  conciertos: Array<{ artista: string; concierto: DigestConcert }>;
};

// En una notificación no entra una lista: el sistema la corta sola. Nombrar
// tres y contar el resto es lo máximo que se lee de un vistazo.
const MAX_NOMBRADOS = 3;

function formatearFecha(date: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Junta las suscripciones por dispositivo. La clave es el endpoint: es lo único
 * que identifica un navegador, y la misma persona con teléfono y computadora
 * son dos suscripciones distintas que reciben cada una la suya.
 *
 * `conciertos` viene de la corrida; `suscripciones` de la base. El cruce por
 * artista lo hace el llamador, que es quien sabe cómo se normaliza el nombre.
 */
export function agruparPorDispositivo(
  pares: Array<{ suscripcion: SuscripcionPush; concierto: DigestConcert }>,
): AvisoPush[] {
  const porEndpoint = new Map<string, AvisoPush>();

  for (const { suscripcion, concierto } of pares) {
    const ya = porEndpoint.get(suscripcion.endpoint);
    const item = { artista: suscripcion.artist, concierto };
    if (ya) {
      // Dos artistas distintos pueden apuntar al mismo show (un festival
      // cargado con varios nombres): que no salga dos veces en la misma
      // notificación.
      if (ya.conciertos.some((c) => c.concierto.slug === concierto.slug)) continue;
      ya.conciertos.push(item);
    } else {
      porEndpoint.set(suscripcion.endpoint, {
        sub: {
          endpoint: suscripcion.endpoint,
          p256dh: suscripcion.p256dh,
          auth: suscripcion.auth,
        },
        conciertos: [item],
      });
    }
  }

  return [...porEndpoint.values()];
}

export function tituloDelAviso(aviso: AvisoPush): string {
  const artistas = [...new Set(aviso.conciertos.map((c) => c.artista))];
  if (artistas.length === 1) return `${artistas[0]} anunció un show`;
  if (artistas.length <= MAX_NOMBRADOS) return `${artistas.join(", ")} anunciaron shows`;
  return `${artistas.length} artistas que seguís anunciaron shows`;
}

export function cuerpoDelAviso(aviso: AvisoPush): string {
  if (aviso.conciertos.length === 1) {
    const c = aviso.conciertos[0].concierto;
    const partes = [c.venue, formatearFecha(c.date), c.time ? `${c.time} hs` : ""].filter(Boolean);
    return partes.join(" · ");
  }
  const nombrados = aviso.conciertos.slice(0, MAX_NOMBRADOS);
  const resto = aviso.conciertos.length - nombrados.length;
  const lista = nombrados.map(({ concierto }) => concierto.artist || concierto.title).join(", ");
  return resto > 0 ? `${lista} y ${resto} más` : lista;
}

/**
 * A dónde lleva el clic. Con un solo show, a su ficha; con varios no hay una
 * página que los contenga a todos, así que va a la agenda.
 */
export function urlDelAviso(aviso: AvisoPush): string {
  if (aviso.conciertos.length === 1) {
    const { slug } = aviso.conciertos[0].concierto;
    return slug ? `${SITE_URL}/concierto/${slug}` : SITE_URL;
  }
  return `${SITE_URL}/agenda`;
}

/**
 * Lo que recibe el service worker. Es lo único que viaja encriptado, así que
 * tiene que bastarse solo: el SW no puede pegarle a la base para completarlo.
 */
export function payloadDelAviso(aviso: AvisoPush): string {
  return JSON.stringify({
    title: tituloDelAviso(aviso),
    body: cuerpoDelAviso(aviso),
    url: urlDelAviso(aviso),
    // Sin tag, dos corridas seguidas apilan dos notificaciones en la pantalla.
    // Con tag fijo, la segunda reemplaza a la primera.
    tag: "misconciertos-artista",
  });
}

/**
 * Manda los avisos. No lanza: se llama después de escribir los conciertos, y un
 * push service caído no puede voltear una corrida.
 */
export async function sendArtistPushes(avisos: AvisoPush[], keys: VapidKeys): Promise<BatchResult> {
  if (avisos.length === 0) return { sent: 0, failed: 0, expiradas: [] };

  const porEndpoint = new Map(avisos.map((a) => [a.sub.endpoint, a]));
  return sendPushBatch(
    avisos.map((a) => a.sub),
    (sub) => {
      const aviso = porEndpoint.get(sub.endpoint);
      return aviso ? payloadDelAviso(aviso) : "{}";
    },
    keys,
  );
}

// ---------------------------------------------------------------------------
// Recordatorio de un show
//
// La otra promesa, y la del botón "Avisame de este show": no "cuando anuncie
// algo" sino "el día antes". Texto aparte del de arriba porque dicen cosas
// distintas —uno es una novedad, el otro es una agenda— y mezclarlos en una
// función con un if terminaría diciendo las dos cosas a medias.
// ---------------------------------------------------------------------------

export type RecordatorioPush = {
  sub: WebPushSubscription;
  conciertos: DigestConcert[];
};

/** Un recordatorio por dispositivo, aunque siga varios shows de mañana. */
export function agruparRecordatorios(
  pares: Array<{ sub: WebPushSubscription; concierto: DigestConcert }>,
): RecordatorioPush[] {
  const porEndpoint = new Map<string, RecordatorioPush>();

  for (const { sub, concierto } of pares) {
    const ya = porEndpoint.get(sub.endpoint);
    if (ya) {
      if (ya.conciertos.some((c) => c.slug === concierto.slug)) continue;
      ya.conciertos.push(concierto);
    } else {
      porEndpoint.set(sub.endpoint, { sub, conciertos: [concierto] });
    }
  }

  return [...porEndpoint.values()];
}

export function tituloDelRecordatorio(r: RecordatorioPush): string {
  if (r.conciertos.length === 1) {
    const c = r.conciertos[0];
    return `Mañana: ${c.artist || c.title}`;
  }
  return `Mañana tenés ${r.conciertos.length} shows`;
}

export function cuerpoDelRecordatorio(r: RecordatorioPush): string {
  if (r.conciertos.length === 1) {
    const c = r.conciertos[0];
    // Sin la fecha: el título ya dijo "mañana", repetirla no agrega nada y en
    // una notificación el espacio es todo.
    return [c.venue, c.time ? `${c.time} hs` : ""].filter(Boolean).join(" · ");
  }
  const nombrados = r.conciertos.slice(0, MAX_NOMBRADOS);
  const resto = r.conciertos.length - nombrados.length;
  const lista = nombrados.map((c) => c.artist || c.title).join(", ");
  return resto > 0 ? `${lista} y ${resto} más` : lista;
}

export function urlDelRecordatorio(r: RecordatorioPush): string {
  if (r.conciertos.length === 1) {
    const { slug } = r.conciertos[0];
    return slug ? `${SITE_URL}/concierto/${slug}` : SITE_URL;
  }
  return `${SITE_URL}/agenda`;
}

export function payloadDelRecordatorio(r: RecordatorioPush): string {
  return JSON.stringify({
    title: tituloDelRecordatorio(r),
    body: cuerpoDelRecordatorio(r),
    url: urlDelRecordatorio(r),
    // Tag propio: un recordatorio de mañana no tiene que pisar un aviso de un
    // show recién anunciado, son dos cosas distintas y las dos importan.
    tag: "misconciertos-recordatorio",
  });
}

export async function sendShowReminders(
  recordatorios: RecordatorioPush[],
  keys: VapidKeys,
): Promise<BatchResult> {
  if (recordatorios.length === 0) return { sent: 0, failed: 0, expiradas: [] };

  const porEndpoint = new Map(recordatorios.map((r) => [r.sub.endpoint, r]));
  return sendPushBatch(
    recordatorios.map((r) => r.sub),
    (sub) => {
      const r = porEndpoint.get(sub.endpoint);
      return r ? payloadDelRecordatorio(r) : "{}";
    },
    keys,
  );
}
