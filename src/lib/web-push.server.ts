// Envío de Web Push con WebCrypto: VAPID (RFC 8292) sobre el encriptado
// aes128gcm de RFC 8291, que a su vez usa el content-encoding de RFC 8188.
//
// Server-only: la clave privada VAPID vive en los secrets del Worker.
//
// Por qué a mano y no con `web-push` de npm: esa librería es Node puro —usa
// `https` y APIs de `node:crypto` que `nodejs_compat` no cubre—, y lo que hace
// es un encriptado que el RFC publica con vectores de prueba fijos. Escrito
// contra WebCrypto entra en el Worker y se testea igual que los parsers: con
// entrada conocida y salida conocida, sin red y sin mocks.
//
// Este módulo es sólo el transporte. Qué dice cada notificación vive en
// push.server.ts, igual que el texto de los mails vive en email.server.ts.
import { describeError } from "@/lib/describe-error";
import { enTandas, FETCHES_EN_PARALELO } from "@/lib/en-tandas";

const TEXTO = new TextEncoder();

/**
 * TypeScript 5.7 hizo `Uint8Array` genérico sobre su buffer, y WebCrypto sólo
 * acepta `ArrayBuffer` —no `SharedArrayBuffer`—. Sin fijarlo, cada llamada a
 * `subtle` no compila. Alias para no repetir el parámetro en cada firma.
 */
type Bytes = Uint8Array<ArrayBuffer>;

// RFC 8188 §2.1: el header del cuerpo es salt(16) + rs(4) + idlen(1) + keyid.
// Con keyid = la pública efímera sin comprimir (65 bytes) da 86 octetos.
const LARGO_SALT = 16;
const LARGO_CLAVE_PUBLICA = 65;
const LARGO_HEADER = LARGO_SALT + 4 + 1 + LARGO_CLAVE_PUBLICA;
const TAMANO_REGISTRO = 4096;
const LARGO_TAG_GCM = 16;

// Los push services aceptan un cuerpo de hasta 4096 bytes. Descontando el
// header, el delimitador de padding y el tag de GCM, esto es lo que queda para
// el texto. Nuestros avisos son de ~200 bytes: el tope es una red, no un techo
// contra el que estemos trabajando.
export const MAX_PAYLOAD_BYTES = 4096 - LARGO_HEADER - 1 - LARGO_TAG_GCM;

// El JWT de VAPID no puede durar más de 24h. 12 alcanza de sobra para una
// corrida y deja margen si el reloj del push service no coincide con el nuestro.
const VAPID_VIGENCIA_SEGUNDOS = 12 * 60 * 60;

// Un show nuevo sigue siendo noticia mañana: si el teléfono estuvo apagado,
// que el push espere en vez de perderse.
const TTL_SEGUNDOS = 24 * 60 * 60;

export type WebPushSubscription = {
  endpoint: string;
  /** Clave pública del navegador, sin comprimir, en base64url. */
  p256dh: string;
  /** Secreto de autenticación del navegador, en base64url. */
  auth: string;
};

export type VapidKeys = {
  /** Pública sin comprimir en base64url. Es la que también viaja al cliente. */
  publicKey: string;
  /** Escalar privado (32 bytes) en base64url. Secreto del Worker. */
  privateKey: string;
  /** Claim `sub` del JWT: un mailto: o https: de contacto. */
  subject: string;
};

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function b64urlToBytes(value: string): Bytes {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binario = atob(relleno);
  const out = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) out[i] = binario.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Bytes): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...partes: Bytes[]): Bytes {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    out.set(parte, offset);
    offset += parte.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claves
//
// WebCrypto no importa un escalar privado suelto: necesita un JWK con `d`, `x`
// e `y`. `d` es la privada; `x` e `y` son las dos mitades de la pública sin
// comprimir, salteando el 0x04 que la marca como tal. Por eso las dos claves
// del par se necesitan juntas para firmar, y por eso regenerar una obliga a
// cambiar la otra.
// ---------------------------------------------------------------------------

function jwkDelPar(privada: Bytes, publica: Bytes): JsonWebKey {
  if (publica.length !== LARGO_CLAVE_PUBLICA || publica[0] !== 0x04) {
    throw new Error(`clave pública inválida: ${publica.length} bytes, prefijo ${publica[0]}`);
  }
  return {
    kty: "EC",
    crv: "P-256",
    d: bytesToB64url(privada),
    x: bytesToB64url(publica.slice(1, 33)),
    y: bytesToB64url(publica.slice(33, 65)),
    ext: true,
  };
}

// `async` y no una función que devuelve la promesa de importKey: `jwkDelPar`
// valida y tira, y sin el async ese throw sale sincrónico. Un llamador que sólo
// hace `.catch()` sobre el resultado no lo agarraría.
export async function importarPrivadaEcdh(privada: Bytes, publica: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwkDelPar(privada, publica),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

function importarPublicaEcdh(publica: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", publica, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function importarPrivadaEcdsa(privada: Bytes, publica: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwkDelPar(privada, publica),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// ---------------------------------------------------------------------------
// Derivación de claves (RFC 8291 §3.4)
// ---------------------------------------------------------------------------

async function hkdf(ikm: Bytes, salt: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const clave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    clave,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Las tres claves que salen del ECDH: el IKM intermedio, la clave de contenido
 * y el nonce. Exportada porque el RFC publica los tres valores para su ejemplo
 * y son lo que hace testeable a todo esto.
 */
export async function derivarClaves(params: {
  ecdhSecret: Bytes;
  authSecret: Bytes;
  salt: Bytes;
  uaPublic: Bytes;
  asPublic: Bytes;
}): Promise<{ ikm: Bytes; cek: Bytes; nonce: Bytes }> {
  const { ecdhSecret, authSecret, salt, uaPublic, asPublic } = params;

  // key_info = "WebPush: info" || 0x00 || ua_public || as_public
  const keyInfo = concat(TEXTO.encode("WebPush: info"), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);

  const cekInfo = concat(TEXTO.encode("Content-Encoding: aes128gcm"), new Uint8Array([0]));
  const nonceInfo = concat(TEXTO.encode("Content-Encoding: nonce"), new Uint8Array([0]));

  const [cek, nonce] = await Promise.all([
    hkdf(ikm, salt, cekInfo, 16),
    hkdf(ikm, salt, nonceInfo, 12),
  ]);

  return { ikm, cek, nonce };
}

// ---------------------------------------------------------------------------
// Cuerpo encriptado
// ---------------------------------------------------------------------------

/**
 * Arma el cuerpo con un salt y un par efímero dados. Separada de
 * `encriptarPayload` para poder correrla contra los vectores del RFC: con los
 * dos valores aleatorios adentro no habría forma de comparar contra nada.
 */
export async function construirCuerpo(params: {
  uaPublic: Bytes;
  authSecret: Bytes;
  asPublic: Bytes;
  asPrivate: CryptoKey;
  salt: Bytes;
  payload: Bytes;
}): Promise<Bytes> {
  const { uaPublic, authSecret, asPublic, asPrivate, salt, payload } = params;

  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`payload de ${payload.length} bytes, el máximo es ${MAX_PAYLOAD_BYTES}`);
  }

  const publicaDelNavegador = await importarPublicaEcdh(uaPublic);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: publicaDelNavegador }, asPrivate, 256),
  );

  const { cek, nonce } = await derivarClaves({ ecdhSecret, authSecret, salt, uaPublic, asPublic });

  // RFC 8188 §2.1. El record size va big-endian.
  const header = new Uint8Array(LARGO_HEADER);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(LARGO_SALT, TAMANO_REGISTRO, false);
  header[LARGO_SALT + 4] = LARGO_CLAVE_PUBLICA;
  header.set(asPublic, LARGO_SALT + 5);

  // Único registro, así que el delimitador de padding es 0x02 y no 0x01.
  const conDelimitador = concat(payload, new Uint8Array([0x02]));
  const claveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: LARGO_TAG_GCM * 8 },
      claveAes,
      conDelimitador,
    ),
  );

  return concat(header, cifrado);
}

/** Cuerpo listo para mandar, con salt y par efímero nuevos por mensaje. */
export async function encriptarPayload(sub: WebPushSubscription, payload: string): Promise<Bytes> {
  const salt = crypto.getRandomValues(new Uint8Array(LARGO_SALT));
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));

  return construirCuerpo({
    uaPublic: b64urlToBytes(sub.p256dh),
    authSecret: b64urlToBytes(sub.auth),
    asPublic,
    asPrivate: par.privateKey,
    salt,
    payload: TEXTO.encode(payload),
  });
}

// ---------------------------------------------------------------------------
// VAPID (RFC 8292)
// ---------------------------------------------------------------------------

/**
 * El header `Authorization` para un push service. El `aud` es el **origen del
 * endpoint**, no la suscripción: todas las suscripciones de un mismo servicio
 * comparten el mismo JWT, y por eso `sendPushBatch` lo firma una vez por
 * servicio en vez de una vez por destinatario.
 */
export async function vapidAuthorization(
  audience: string,
  keys: VapidKeys,
  ahoraMs: number = Date.now(),
): Promise<string> {
  const publica = b64urlToBytes(keys.publicKey);
  const clave = await importarPrivadaEcdsa(b64urlToBytes(keys.privateKey), publica);

  const header = bytesToB64url(TEXTO.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    TEXTO.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(ahoraMs / 1000) + VAPID_VIGENCIA_SEGUNDOS,
        sub: keys.subject,
      }),
    ),
  );

  const firmado = `${header}.${payload}`;
  // WebCrypto devuelve la firma ECDSA como r||s crudo, que es justo lo que pide
  // JWS. Por el camino de `node:crypto` vendría en DER y habría que convertirla;
  // acá no.
  const firma = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    clave,
    TEXTO.encode(firmado),
  );

  return `vapid t=${firmado}.${bytesToB64url(new Uint8Array(firma))}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

export type PushResult = {
  ok: boolean;
  status: number;
  /** 404/410: el navegador se dio de baja o el endpoint caducó. Hay que borrar la fila. */
  expirada: boolean;
  error?: string;
};

/**
 * Manda un push. No lanza nunca, por el mismo motivo que los mails: se llama
 * después de escribir los conciertos y un push service caído no puede voltear
 * una corrida.
 */
export async function sendPush(
  sub: WebPushSubscription,
  payload: string,
  keys: VapidKeys,
  authorization?: string,
): Promise<PushResult> {
  try {
    const audience = new URL(sub.endpoint).origin;
    const auth = authorization ?? (await vapidAuthorization(audience, keys));
    const cuerpo = await encriptarPayload(sub, payload);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(TTL_SEGUNDOS),
        Urgency: "normal",
      },
      body: cuerpo,
    });

    // 404 y 410 son la baja: el navegador desinstaló el service worker, el
    // usuario revocó el permiso o el endpoint rotó. Es información útil, no un
    // error: la fila se borra y el próximo envío no la reintenta.
    const expirada = res.status === 404 || res.status === 410;
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      if (!expirada) {
        console.error("[web-push] envío falló", res.status, detalle.slice(0, 300));
      }
      return {
        ok: false,
        status: res.status,
        expirada,
        error: `push ${res.status}: ${detalle.slice(0, 200)}`,
      };
    }

    return { ok: true, status: res.status, expirada: false };
  } catch (err) {
    console.error("[web-push] envío tiró", err);
    return { ok: false, status: 0, expirada: false, error: describeError(err) };
  }
}

export type BatchResult = {
  sent: number;
  failed: number;
  /** Endpoints que respondieron 404/410 y hay que borrar de la base. */
  expiradas: string[];
  error?: string;
};

/**
 * Manda un push por suscripción, firmando un JWT por push service en vez de uno
 * por destinatario: cien suscripciones de Chrome son cien fetches pero una sola
 * firma ECDSA.
 *
 * Los envíos van de a tandas con el mismo `enTandas` que la ingesta y por la
 * misma razón: en serie, cien pushes tardan más de lo que el cron espera.
 */
export async function sendPushBatch(
  subs: WebPushSubscription[],
  payloadPara: (sub: WebPushSubscription) => string,
  keys: VapidKeys,
  concurrencia = FETCHES_EN_PARALELO,
): Promise<BatchResult> {
  if (subs.length === 0) return { sent: 0, failed: 0, expiradas: [] };

  // Una promesa por audiencia, guardada antes de resolverse: si seis envíos de
  // la misma tanda piden el JWT de Chrome a la vez, firman una sola vez.
  const porAudiencia = new Map<string, Promise<string>>();
  const autorizacion = (endpoint: string): Promise<string> => {
    let audience: string;
    try {
      audience = new URL(endpoint).origin;
    } catch {
      return Promise.reject(new Error(`endpoint inválido: ${endpoint.slice(0, 80)}`));
    }
    let pendiente = porAudiencia.get(audience);
    if (!pendiente) {
      pendiente = vapidAuthorization(audience, keys);
      porAudiencia.set(audience, pendiente);
    }
    return pendiente;
  };

  // `enTandas` descarta lo que tira, así que el try/catch de adentro no es
  // decorativo: sin él, una suscripción con un endpoint roto desaparecería de
  // la cuenta y la corrida marcaría los conciertos como avisados igual.
  const resultados = await enTandas(
    subs,
    async (sub) => {
      try {
        const auth = await autorizacion(sub.endpoint);
        return { sub, res: await sendPush(sub, payloadPara(sub), keys, auth) };
      } catch (err) {
        const res: PushResult = {
          ok: false,
          status: 0,
          expirada: false,
          error: describeError(err),
        };
        return { sub, res };
      }
    },
    (sub, err) => console.error("[web-push] tanda", sub.endpoint.slice(0, 60), err),
    concurrencia,
  );

  let sent = 0;
  let failed = 0;
  const expiradas: string[] = [];
  let primerError: string | undefined;

  for (const { sub, res } of resultados) {
    if (res.ok) {
      sent++;
      continue;
    }
    // Una suscripción caduca sola y eso no es una falla del envío: contarla
    // como tal dejaría los conciertos sin marcar para siempre, porque el
    // próximo intento sobre la misma fila muerta volvería a "fallar".
    if (res.expirada) {
      expiradas.push(sub.endpoint);
      continue;
    }
    failed++;
    primerError ??= res.error;
  }

  return { sent, failed, expiradas, ...(primerError ? { error: primerError } : {}) };
}
