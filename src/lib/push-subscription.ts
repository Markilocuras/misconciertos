// Qué acepta y qué rechaza /api/public/hooks/subscribe-push.
//
// Separado del handler porque es la parte que se puede testear: el endpoint es
// público y sin auth, escribe con el cliente service-role y recibe lo que se le
// mande. Todo lo que pase de acá entra a la base.
//
// Una suscripción mal formada no falla al guardarse: falla doce horas después,
// al encriptar, en otra máquina y sin nadie mirando. Por eso se valida contra
// los largos exactos del protocolo y no con un "es un string no vacío".

/** Punto sin comprimir de P-256: 65 bytes en base64url sin padding. */
const LARGO_P256DH = 87;
/** Secreto de autenticación del navegador: 16 bytes en base64url. */
const LARGO_AUTH = 22;

const B64URL = /^[A-Za-z0-9_-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// El mismo que el CHECK de la tabla: rechazar acá lo que la base va a rechazar
// igual, pero con un 400 que dice qué pasó en vez de un 500.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const MAX_ENDPOINT = 1000;
const MIN_ENDPOINT = 20;
const MAX_ARTIST = 200;
const MAX_EMAIL = 254;

export type Alta = {
  accion: "alta";
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Excluyente con `concertId`, igual que el CHECK de la tabla. */
  artist: string | null;
  concertId: string | null;
};

export type Baja = {
  accion: "baja";
  endpoint: string;
  /** Los dos en null significa "de todo lo que siga este navegador". */
  artist: string | null;
  concertId: string | null;
};

export type Migracion = {
  accion: "migrar";
  endpoint: string;
  endpointViejo: string;
  p256dh: string;
  auth: string;
};

export type Mail = {
  accion: "mail";
  concertId: string;
  email: string;
};

export type Pedido = Alta | Baja | Migracion | Mail;

export type Parseo = { ok: true; pedido: Pedido } | { ok: false; error: string };

const mal = (error: string): Parseo => ({ ok: false, error });

function texto(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const limpio = value.trim();
  return limpio.length >= min && limpio.length <= max ? limpio : null;
}

function clave(value: unknown, largo: number): string | null {
  return typeof value === "string" && value.length === largo && B64URL.test(value) ? value : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

/**
 * Sólo https, y sólo lo que parsea como URL.
 *
 * Aceptar cualquier cosa convertiría esto en un relay abierto: alguien podría
 * suscribir un endpoint propio y hacer que el Worker le postee a donde quiera,
 * dos veces por día y gratis, firmado con nuestras claves VAPID.
 */
export function endpointValido(value: unknown): string | null {
  const bruto = texto(value, MIN_ENDPOINT, MAX_ENDPOINT);
  if (!bruto) return null;
  try {
    const url = new URL(bruto);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** true si la clave vino en el cuerpo, aunque sea como null o basura. */
function vino(body: Record<string, unknown>, clave: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, clave) && body[clave] != null;
}

export function parsearPedido(bruto: unknown): Parseo {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return mal("cuerpo");
  }
  const body = bruto as Record<string, unknown>;
  const accion = typeof body.accion === "string" ? body.accion : "alta";

  // El fallback por mail no tiene endpoint: no hay push del que hablar.
  if (accion === "mail") {
    const concertId = uuid(body.concertId);
    const email = texto(body.email, 3, MAX_EMAIL)?.toLowerCase() ?? null;
    if (!concertId) return mal("concertId");
    if (!email || !EMAIL_RE.test(email)) return mal("email");
    return { ok: true, pedido: { accion: "mail", concertId, email } };
  }

  const endpoint = endpointValido(body.endpoint);
  if (!endpoint) return mal("endpoint");

  if (accion === "baja") {
    const artist = texto(body.artist, 1, MAX_ARTIST);
    const concertId = uuid(body.concertId);

    // Falla cerrada, y esto importa: sin el chequeo, un concertId con un typo
    // no matchea nada, los dos quedan en null y la baja borra TODAS las
    // suscripciones de ese navegador en vez de una. El usuario pidió darse de
    // baja de un show y se quedaría sin ninguno de sus avisos, sin enterarse.
    if (vino(body, "artist") && !artist) return mal("artist");
    if (vino(body, "concertId") && !concertId) return mal("concertId");

    return { ok: true, pedido: { accion: "baja", endpoint, artist, concertId } };
  }

  if (accion === "migrar") {
    const endpointViejo = endpointValido(body.endpointViejo);
    const p256dh = clave(body.p256dh, LARGO_P256DH);
    const auth = clave(body.auth, LARGO_AUTH);
    if (!endpointViejo) return mal("endpointViejo");
    if (!p256dh) return mal("p256dh");
    if (!auth) return mal("auth");
    return { ok: true, pedido: { accion: "migrar", endpoint, endpointViejo, p256dh, auth } };
  }

  if (accion !== "alta") return mal("accion");

  const artist = texto(body.artist, 1, MAX_ARTIST);
  const concertId = uuid(body.concertId);
  const p256dh = clave(body.p256dh, LARGO_P256DH);
  const auth = clave(body.auth, LARGO_AUTH);

  if (!p256dh) return mal("p256dh");
  if (!auth) return mal("auth");
  // Un artista o un show, nunca los dos ni ninguno. Es el mismo CHECK que tiene
  // la tabla, acá para poder contestar 400 en vez de dejar reventar el insert.
  if ((artist && concertId) || (!artist && !concertId)) return mal("objetivo");

  return { ok: true, pedido: { accion: "alta", endpoint, artist, concertId, p256dh, auth } };
}
