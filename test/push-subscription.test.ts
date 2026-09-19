import { describe, expect, it } from "vitest";

import { endpointValido, parsearPedido } from "@/lib/push-subscription";

// subscribe-push es público, sin auth, y escribe con el cliente service-role:
// recibe lo que le manden. Todo lo que pase de acá entra a la base, así que
// esto es el filtro y conviene tenerlo cubierto.

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abcdefghijklmnop";
const P256DH =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const SHOW = "11111111-1111-1111-1111-111111111111";

const alta = (over: Record<string, unknown> = {}) => ({
  endpoint: ENDPOINT,
  p256dh: P256DH,
  auth: AUTH,
  concertId: SHOW,
  ...over,
});

function error(body: unknown): string | null {
  const r = parsearPedido(body);
  return r.ok ? null : r.error;
}

describe("endpointValido", () => {
  it("acepta un endpoint https de un push service", () => {
    expect(endpointValido(ENDPOINT)).toBe(ENDPOINT);
  });

  // Sin esto el endpoint es un relay abierto: cualquiera suscribe una URL suya
  // y el Worker le postea dos veces por día, gratis y firmado por nosotros.
  it("rechaza http, y cualquier cosa que no sea una URL", () => {
    expect(endpointValido("http://evil.example.com/un-endpoint-largo")).toBeNull();
    expect(endpointValido("javascript:alert(1)//padding-para-el-largo")).toBeNull();
    expect(endpointValido("no soy una url pero soy larga igual")).toBeNull();
  });

  it("rechaza lo demasiado corto y lo demasiado largo", () => {
    expect(endpointValido("https://a.co")).toBeNull();
    expect(endpointValido(`https://fcm.googleapis.com/${"x".repeat(1200)}`)).toBeNull();
  });

  it("rechaza lo que no es string", () => {
    for (const v of [null, undefined, 42, {}, []]) expect(endpointValido(v)).toBeNull();
  });
});

describe("alta", () => {
  it("acepta una suscripción a un show", () => {
    const r = parsearPedido(alta());
    expect(r).toEqual({
      ok: true,
      pedido: {
        accion: "alta",
        endpoint: ENDPOINT,
        p256dh: P256DH,
        auth: AUTH,
        artist: null,
        concertId: SHOW,
      },
    });
  });

  it("acepta una suscripción a un artista", () => {
    const r = parsearPedido(alta({ concertId: undefined, artist: "Conociendo Rusia" }));
    expect(r.ok && r.pedido.accion === "alta" && r.pedido.artist).toBe("Conociendo Rusia");
  });

  it("sin accion asume alta", () => {
    expect(parsearPedido(alta()).ok).toBe(true);
  });

  // Las claves tienen largo fijo por protocolo. Una cortada a la mitad se
  // guarda sin chistar y recién falla al encriptar, medio día después.
  it("exige el largo exacto de las dos claves", () => {
    expect(error(alta({ p256dh: P256DH.slice(0, 86) }))).toBe("p256dh");
    expect(error(alta({ p256dh: `${P256DH}x` }))).toBe("p256dh");
    expect(error(alta({ auth: AUTH.slice(0, 21) }))).toBe("auth");
  });

  it("rechaza claves que no son base64url", () => {
    expect(error(alta({ p256dh: `${"+".repeat(87)}` }))).toBe("p256dh");
    expect(error(alta({ auth: `${"/".repeat(22)}` }))).toBe("auth");
  });

  // Mismo CHECK que la tabla. Que lo valide también acá es para contestar 400
  // con un motivo en vez de dejar reventar el insert con un 500.
  it("exige un objetivo y sólo uno", () => {
    expect(error(alta({ concertId: undefined }))).toBe("objetivo");
    expect(error(alta({ artist: "Jairo" }))).toBe("objetivo");
  });

  it("rechaza un concertId que no es uuid", () => {
    expect(error(alta({ concertId: "no-soy-uuid" }))).toBe("objetivo");
  });

  it("recorta los espacios del artista", () => {
    const r = parsearPedido(alta({ concertId: undefined, artist: "  Jairo  " }));
    expect(r.ok && r.pedido.accion === "alta" && r.pedido.artist).toBe("Jairo");
  });
});

describe("baja", () => {
  it("con concertId da de baja sólo ese show", () => {
    const r = parsearPedido({ accion: "baja", endpoint: ENDPOINT, concertId: SHOW });
    expect(r).toEqual({
      ok: true,
      pedido: { accion: "baja", endpoint: ENDPOINT, artist: null, concertId: SHOW },
    });
  });

  it("sin objetivo da de baja todo lo de ese navegador", () => {
    const r = parsearPedido({ accion: "baja", endpoint: ENDPOINT });
    expect(r.ok && r.pedido.accion === "baja" && r.pedido.concertId).toBeNull();
  });

  // Este es el que importa. Sin el chequeo, un concertId con un typo no
  // matchea, los dos campos quedan en null y la baja borra TODAS las
  // suscripciones del navegador: pediste dejar de seguir un show y te quedaste
  // sin ninguno de tus avisos, sin enterarte.
  it("falla cerrada: un objetivo presente pero inválido es un error, no un 'todo'", () => {
    expect(error({ accion: "baja", endpoint: ENDPOINT, concertId: "no-soy-uuid" })).toBe(
      "concertId",
    );
    expect(error({ accion: "baja", endpoint: ENDPOINT, artist: "" })).toBe("artist");
    expect(error({ accion: "baja", endpoint: ENDPOINT, artist: "x".repeat(300) })).toBe("artist");
  });

  // Un `concertId: null` explícito es el frontend diciendo "no aplica", no un
  // objetivo roto: eso sí es una baja de todo.
  it("un null explícito no es un objetivo inválido", () => {
    const r = parsearPedido({ accion: "baja", endpoint: ENDPOINT, concertId: null });
    expect(r.ok).toBe(true);
  });
});

describe("migrar", () => {
  const VIEJO = "https://fcm.googleapis.com/fcm/send/zzzzzzzzzzzzzzzz";

  it("acepta los dos endpoints y las claves nuevas", () => {
    const r = parsearPedido({
      accion: "migrar",
      endpoint: ENDPOINT,
      endpointViejo: VIEJO,
      p256dh: P256DH,
      auth: AUTH,
    });
    expect(r.ok && r.pedido.accion === "migrar" && r.pedido.endpointViejo).toBe(VIEJO);
  });

  it("exige el endpoint viejo y las claves", () => {
    const base = { accion: "migrar", endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH };
    expect(error(base)).toBe("endpointViejo");
    expect(error({ ...base, endpointViejo: VIEJO, p256dh: "corta" })).toBe("p256dh");
  });
});

describe("mail", () => {
  it("acepta un show y un mail, normalizado a minúsculas", () => {
    const r = parsearPedido({ accion: "mail", concertId: SHOW, email: "  YO@Ejemplo.COM " });
    expect(r).toEqual({
      ok: true,
      pedido: { accion: "mail", concertId: SHOW, email: "yo@ejemplo.com" },
    });
  });

  // No pide endpoint a propósito: el fallback existe justamente porque no hay
  // push del que hablar.
  it("no necesita endpoint", () => {
    expect(parsearPedido({ accion: "mail", concertId: SHOW, email: "yo@ejemplo.com" }).ok).toBe(
      true,
    );
  });

  it("rechaza un mail sin arroba o sin dominio", () => {
    expect(error({ accion: "mail", concertId: SHOW, email: "sinarroba" })).toBe("email");
    expect(error({ accion: "mail", concertId: SHOW, email: "yo@sindominio" })).toBe("email");
    expect(error({ accion: "mail", concertId: SHOW, email: `${"x".repeat(250)}@a.com` })).toBe(
      "email",
    );
  });

  it("rechaza un show que no es uuid", () => {
    expect(error({ accion: "mail", concertId: "x", email: "yo@ejemplo.com" })).toBe("concertId");
  });
});

describe("cuerpos basura", () => {
  it("rechaza lo que no es un objeto", () => {
    for (const v of [null, undefined, 42, "hola", [1, 2]]) {
      expect(error(v)).toBe("cuerpo");
    }
  });

  it("rechaza una accion desconocida en vez de tratarla como alta", () => {
    expect(error({ ...alta(), accion: "borrar-todo" })).toBe("accion");
  });
});
