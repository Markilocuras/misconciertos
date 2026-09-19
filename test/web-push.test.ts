import { afterEach, describe, expect, it, vi } from "vitest";

import {
  b64urlToBytes,
  bytesToB64url,
  construirCuerpo,
  derivarClaves,
  importarPrivadaEcdh,
  MAX_PAYLOAD_BYTES,
  sendPush,
  sendPushBatch,
  vapidAuthorization,
  type VapidKeys,
  type WebPushSubscription,
} from "@/lib/web-push.server";

// El encriptado de Web Push es la parte del proyecto donde un error no se ve:
// un cuerpo mal armado no tira excepción, el push service contesta 201 y el
// teléfono no muestra nada. Por eso está escrito contra WebCrypto y no con una
// librería —el RFC 8291 publica el ejemplo entero, con claves fijas y salida
// fija, y eso es exactamente un test de los que este repo ya tiene.
//
// Los valores de abajo son textuales del Apéndice A de RFC 8291.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  ecdhSecret: "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs",
  ikm: "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg",
  cek: "oIhVW04MRdy2XN9CiKLxTg",
  nonce: "4h_95klXJ5E_qnoN",
  header:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  ciphertext: "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("base64url", () => {
  it("va y vuelve sin perder bytes", () => {
    for (const valor of [RFC.salt, RFC.authSecret, RFC.asPublic, RFC.cek]) {
      expect(bytesToB64url(b64urlToBytes(valor))).toBe(valor);
    }
  });

  it("decodifica sin padding y con el alfabeto url-safe", () => {
    // 22 caracteres = 16 bytes; el "-" y el "_" no son "+" ni "/".
    expect(b64urlToBytes(RFC.salt)).toHaveLength(16);
    expect(b64urlToBytes(RFC.authSecret)).toHaveLength(16);
    expect(b64urlToBytes(RFC.asPublic)).toHaveLength(65);
    expect(b64urlToBytes(RFC.asPublic)[0]).toBe(0x04);
  });
});

describe("RFC 8291: derivación de claves", () => {
  // Que el ECDH de nuestras claves importadas dé el mismo secreto que publica
  // el RFC es lo que valida `importarPrivadaEcdh`: si el JWK estuviera mal
  // armado (x e y invertidas, por ejemplo), esto se cae acá y no en producción.
  it("el ECDH de las claves del ejemplo da el ecdh_secret publicado", async () => {
    const privada = await importarPrivadaEcdh(
      b64urlToBytes(RFC.asPrivate),
      b64urlToBytes(RFC.asPublic),
    );
    const publicaUa = await crypto.subtle.importKey(
      "raw",
      b64urlToBytes(RFC.uaPublic),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const secreto = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "ECDH", public: publicaUa }, privada, 256),
    );
    expect(bytesToB64url(secreto)).toBe(RFC.ecdhSecret);
  });

  it("produce el IKM, la CEK y el nonce del Apéndice A", async () => {
    const { ikm, cek, nonce } = await derivarClaves({
      ecdhSecret: b64urlToBytes(RFC.ecdhSecret),
      authSecret: b64urlToBytes(RFC.authSecret),
      salt: b64urlToBytes(RFC.salt),
      uaPublic: b64urlToBytes(RFC.uaPublic),
      asPublic: b64urlToBytes(RFC.asPublic),
    });

    expect(bytesToB64url(ikm)).toBe(RFC.ikm);
    expect(bytesToB64url(cek)).toBe(RFC.cek);
    expect(bytesToB64url(nonce)).toBe(RFC.nonce);
  });
});

describe("RFC 8291: cuerpo encriptado", () => {
  async function cuerpoDelEjemplo(): Promise<Uint8Array> {
    return construirCuerpo({
      uaPublic: b64urlToBytes(RFC.uaPublic),
      authSecret: b64urlToBytes(RFC.authSecret),
      asPublic: b64urlToBytes(RFC.asPublic),
      asPrivate: await importarPrivadaEcdh(
        b64urlToBytes(RFC.asPrivate),
        b64urlToBytes(RFC.asPublic),
      ),
      salt: b64urlToBytes(RFC.salt),
      payload: new TextEncoder().encode(RFC.plaintext),
    });
  }

  it("arma el header de 86 octetos que publica el RFC", async () => {
    const cuerpo = await cuerpoDelEjemplo();
    const header = cuerpo.slice(0, 86);

    expect(bytesToB64url(header)).toBe(RFC.header);
    // salt(16) + rs(4, big-endian) + idlen(1) + keyid(65)
    expect(bytesToB64url(header.slice(0, 16))).toBe(RFC.salt);
    expect(new DataView(header.buffer, header.byteOffset).getUint32(16, false)).toBe(4096);
    expect(header[20]).toBe(65);
    expect(bytesToB64url(header.slice(21, 86))).toBe(RFC.asPublic);
  });

  it("encripta al mismo ciphertext que el RFC", async () => {
    const cuerpo = await cuerpoDelEjemplo();
    expect(bytesToB64url(cuerpo.slice(86))).toBe(RFC.ciphertext);
  });

  it("el cuerpo entero es el header seguido del ciphertext", async () => {
    const cuerpo = await cuerpoDelEjemplo();
    const esperado = new Uint8Array([
      ...b64urlToBytes(RFC.header),
      ...b64urlToBytes(RFC.ciphertext),
    ]);
    expect(Array.from(cuerpo)).toEqual(Array.from(esperado));
    // 41 del texto + 1 del delimitador + 16 del tag de GCM.
    expect(cuerpo.length).toBe(86 + 41 + 1 + 16);
  });

  it("rechaza un payload más grande de lo que entra en un registro", async () => {
    await expect(
      construirCuerpo({
        uaPublic: b64urlToBytes(RFC.uaPublic),
        authSecret: b64urlToBytes(RFC.authSecret),
        asPublic: b64urlToBytes(RFC.asPublic),
        asPrivate: await importarPrivadaEcdh(
          b64urlToBytes(RFC.asPrivate),
          b64urlToBytes(RFC.asPublic),
        ),
        salt: b64urlToBytes(RFC.salt),
        payload: new Uint8Array(MAX_PAYLOAD_BYTES + 1),
      }),
    ).rejects.toThrow(/máximo/);
  });

  it("rechaza una clave pública que no sea un punto sin comprimir", async () => {
    await expect(
      importarPrivadaEcdh(b64urlToBytes(RFC.asPrivate), new Uint8Array(64)),
    ).rejects.toThrow(/clave pública inválida/);
  });
});

// ---------------------------------------------------------------------------

const CLAVES: VapidKeys = {
  publicKey: RFC.asPublic,
  privateKey: RFC.asPrivate,
  subject: "mailto:avisos@misconciertos.com.ar",
};

describe("VAPID", () => {
  it("firma un JWT que verifica con la clave pública del par", async () => {
    const header = await vapidAuthorization("https://fcm.googleapis.com", CLAVES);

    const [, token] = header.match(/^vapid t=([^,]+), k=(.+)$/) ?? [];
    expect(token).toBeTruthy();

    const [h, p, firma] = token.split(".");
    const publica = await crypto.subtle.importKey(
      "raw",
      b64urlToBytes(CLAVES.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valida = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publica,
      b64urlToBytes(firma),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valida).toBe(true);
  });

  it("manda la pública en k= y usa ES256", async () => {
    const header = await vapidAuthorization("https://fcm.googleapis.com", CLAVES);
    expect(header.endsWith(`, k=${CLAVES.publicKey}`)).toBe(true);

    const token = header.slice("vapid t=".length).split(",")[0];
    const jwtHeader = JSON.parse(new TextDecoder().decode(b64urlToBytes(token.split(".")[0])));
    expect(jwtHeader).toEqual({ typ: "JWT", alg: "ES256" });
  });

  // El `aud` es el origen del endpoint, no la URL entera: mandar la URL
  // completa es el error clásico y el push service contesta 401.
  it("el aud es el origen del endpoint y el exp no pasa las 24h", async () => {
    const ahora = Date.UTC(2026, 8, 18, 12, 0, 0);
    const header = await vapidAuthorization("https://fcm.googleapis.com", CLAVES, ahora);
    const token = header.slice("vapid t=".length).split(",")[0];
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(token.split(".")[1])));

    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:avisos@misconciertos.com.ar");
    expect(payload.exp).toBeGreaterThan(Math.floor(ahora / 1000));
    expect(payload.exp).toBeLessThanOrEqual(Math.floor(ahora / 1000) + 24 * 60 * 60);
  });
});

// ---------------------------------------------------------------------------

const SUB = (endpoint: string): WebPushSubscription => ({
  endpoint,
  p256dh: RFC.uaPublic,
  auth: RFC.authSecret,
});

function mockFetch(responder: (url: string) => Partial<Response> | Error) {
  const fn = vi.fn(async (url: string) => {
    const r = responder(url);
    if (r instanceof Error) throw r;
    return { ok: true, status: 201, text: async () => "", ...r } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("sendPush", () => {
  it("postea el cuerpo encriptado con los headers del protocolo", async () => {
    const fetchMock = mockFetch(() => ({ status: 201 }));
    const res = await sendPush(SUB("https://fcm.googleapis.com/fcm/send/abc"), "hola", CLAVES);

    expect(res).toMatchObject({ ok: true, status: 201, expirada: false });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(Number(headers.TTL)).toBeGreaterThan(0);
    expect((init.body as Uint8Array).length).toBeGreaterThan(86);
  });

  // 410 es el navegador diciendo "esta suscripción ya no existe". Distinguirlo
  // de una falla es lo que permite borrar la fila en vez de reintentarla para
  // siempre.
  it("marca como expirada un 404 o un 410, y no los loguea como error", async () => {
    for (const status of [404, 410]) {
      const res = await (async () => {
        mockFetch(() => ({ ok: false, status }));
        return sendPush(SUB("https://fcm.googleapis.com/fcm/send/abc"), "hola", CLAVES);
      })();
      expect(res).toMatchObject({ ok: false, status, expirada: true });
    }
  });

  it("no lanza si el push service tira: se llama después de escribir en la base", async () => {
    mockFetch(() => new Error("connection reset"));
    const res = await sendPush(SUB("https://fcm.googleapis.com/fcm/send/abc"), "hola", CLAVES);
    expect(res).toMatchObject({ ok: false, status: 0, expirada: false });
    expect(res.error).toContain("connection reset");
  });

  it("no lanza con un endpoint que no es una URL", async () => {
    mockFetch(() => ({ status: 201 }));
    const res = await sendPush(SUB("no-soy-una-url"), "hola", CLAVES);
    expect(res.ok).toBe(false);
  });
});

describe("sendPushBatch", () => {
  it("firma un JWT por push service, no uno por destinatario", async () => {
    const fetchMock = mockFetch(() => ({ status: 201 }));
    const subs = [
      SUB("https://fcm.googleapis.com/fcm/send/1"),
      SUB("https://fcm.googleapis.com/fcm/send/2"),
      SUB("https://updates.push.services.mozilla.com/wpush/v2/3"),
    ];

    const res = await sendPushBatch(subs, () => "hola", CLAVES);
    expect(res).toMatchObject({ sent: 3, failed: 0, expiradas: [] });

    const auth = fetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>).Authorization,
    );
    // Las dos de Chrome comparten token; la de Firefox tiene el suyo.
    expect(auth[0]).toBe(auth[1]);
    expect(auth[2]).not.toBe(auth[0]);
  });

  it("separa las expiradas de las que fallaron de verdad", async () => {
    mockFetch((url) => {
      if (url.endsWith("/muerta")) return { ok: false, status: 410 };
      if (url.endsWith("/rota")) return { ok: false, status: 500 };
      return { status: 201 };
    });

    const res = await sendPushBatch(
      [
        SUB("https://fcm.googleapis.com/fcm/send/viva"),
        SUB("https://fcm.googleapis.com/fcm/send/muerta"),
        SUB("https://fcm.googleapis.com/fcm/send/rota"),
      ],
      () => "hola",
      CLAVES,
    );

    expect(res.sent).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.expiradas).toEqual(["https://fcm.googleapis.com/fcm/send/muerta"]);
    expect(res.error).toContain("500");
  });

  // Sin destinatarios no se toca la red: una corrida sin suscriptos no debería
  // costar ni un subrequest.
  it("con la lista vacía no llama a fetch", async () => {
    const fetchMock = mockFetch(() => ({ status: 201 }));
    const res = await sendPushBatch([], () => "hola", CLAVES);
    expect(res).toEqual({ sent: 0, failed: 0, expiradas: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("le manda a cada suscripción el payload que le corresponde", async () => {
    const fetchMock = mockFetch(() => ({ status: 201 }));
    const subs = [
      SUB("https://fcm.googleapis.com/fcm/send/1"),
      SUB("https://fcm.googleapis.com/fcm/send/2"),
    ];

    await sendPushBatch(subs, (s) => `para ${s.endpoint.slice(-1)}`, CLAVES);

    // El orden de salida de enTandas es el de entrada: sin eso, no se podría
    // afirmar cuál cuerpo fue a cuál endpoint.
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([subs[0].endpoint, subs[1].endpoint]);
  });
});
