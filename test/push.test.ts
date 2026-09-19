import { describe, expect, it } from "vitest";

import {
  agruparPorDispositivo,
  cuerpoDelAviso,
  payloadDelAviso,
  tituloDelAviso,
  urlDelAviso,
  type AvisoPush,
  type SuscripcionPush,
} from "@/lib/push.server";
import { SITE_URL } from "@/lib/site";

// Una notificación mal armada no falla: sale, y dice algo que no se entiende.
// Estas funciones son puras justamente para poder mirar el texto sin mandar
// nada.

const sub = (endpoint: string, artist: string): SuscripcionPush => ({
  endpoint,
  p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  artist,
});

const concierto = (artist: string, slug: string, extra: Record<string, unknown> = {}) => ({
  title: artist,
  artist,
  venue: "Teatro Gran Rex",
  date: "2026-11-07",
  time: "21:00",
  slug,
  ...extra,
});

const TELEFONO = "https://fcm.googleapis.com/fcm/send/telefono";
const COMPU = "https://updates.push.services.mozilla.com/wpush/v2/compu";

describe("agruparPorDispositivo", () => {
  it("junta en un aviso los artistas que sigue el mismo dispositivo", () => {
    const avisos = agruparPorDispositivo([
      { suscripcion: sub(TELEFONO, "Jairo"), concierto: concierto("Jairo", "jairo-gran-rex") },
      {
        suscripcion: sub(TELEFONO, "Conociendo Rusia"),
        concierto: concierto("Conociendo Rusia", "conociendo-rusia-vorterix"),
      },
    ]);

    expect(avisos).toHaveLength(1);
    expect(avisos[0].sub.endpoint).toBe(TELEFONO);
    expect(avisos[0].conciertos.map((c) => c.artista)).toEqual(["Jairo", "Conociendo Rusia"]);
  });

  // Teléfono y computadora de la misma persona son dos suscripciones: cada una
  // recibe la suya, porque el endpoint es lo único que identifica al navegador.
  it("no mezcla dos dispositivos", () => {
    const avisos = agruparPorDispositivo([
      { suscripcion: sub(TELEFONO, "Jairo"), concierto: concierto("Jairo", "jairo-gran-rex") },
      { suscripcion: sub(COMPU, "Jairo"), concierto: concierto("Jairo", "jairo-gran-rex") },
    ]);

    expect(avisos).toHaveLength(2);
    expect(avisos.map((a) => a.sub.endpoint)).toEqual([TELEFONO, COMPU]);
  });

  // Un festival cargado con varios nombres hace que dos artistas seguidos
  // apunten al mismo show. Sin deduplicar, la notificación lo nombra dos veces.
  it("no repite el mismo concierto aunque lo disparen dos artistas", () => {
    const mismoShow = concierto("Festival", "festival-hipodromo");
    const avisos = agruparPorDispositivo([
      { suscripcion: sub(TELEFONO, "Jairo"), concierto: mismoShow },
      { suscripcion: sub(TELEFONO, "Conociendo Rusia"), concierto: mismoShow },
    ]);

    expect(avisos).toHaveLength(1);
    expect(avisos[0].conciertos).toHaveLength(1);
  });

  it("con la lista vacía no devuelve avisos", () => {
    expect(agruparPorDispositivo([])).toEqual([]);
  });
});

const uno: AvisoPush = {
  sub: { endpoint: TELEFONO, p256dh: "x", auth: "y" },
  conciertos: [{ artista: "Jairo", concierto: concierto("Jairo", "jairo-gran-rex") }],
};

const varios = (n: number): AvisoPush => ({
  sub: { endpoint: TELEFONO, p256dh: "x", auth: "y" },
  conciertos: Array.from({ length: n }, (_, i) => ({
    artista: `Artista ${i + 1}`,
    concierto: concierto(`Artista ${i + 1}`, `artista-${i + 1}`),
  })),
});

describe("texto del aviso", () => {
  it("con un artista dice su nombre", () => {
    expect(tituloDelAviso(uno)).toBe("Jairo anunció un show");
  });

  it("con dos o tres los nombra a todos", () => {
    expect(tituloDelAviso(varios(3))).toBe("Artista 1, Artista 2, Artista 3 anunciaron shows");
  });

  // Más de tres nombres no entran en una notificación: el sistema la corta.
  it("con muchos cuenta en vez de listar", () => {
    expect(tituloDelAviso(varios(7))).toBe("7 artistas que seguís anunciaron shows");
  });

  it("con un solo show el cuerpo tiene lugar, fecha y hora", () => {
    const cuerpo = cuerpoDelAviso(uno);
    expect(cuerpo).toContain("Teatro Gran Rex");
    expect(cuerpo).toContain("7 de noviembre");
    expect(cuerpo).toContain("21:00 hs");
  });

  it("con varios lista los primeros y cuenta el resto", () => {
    expect(cuerpoDelAviso(varios(5))).toBe("Artista 1, Artista 2, Artista 3 y 2 más");
  });

  it("no se rompe con un concierto sin fecha ni hora", () => {
    const sinDatos: AvisoPush = {
      sub: uno.sub,
      conciertos: [
        {
          artista: "Jairo",
          concierto: concierto("Jairo", "jairo", { date: null, time: null }),
        },
      ],
    };
    expect(cuerpoDelAviso(sinDatos)).toBe("Teatro Gran Rex");
  });
});

describe("urlDelAviso", () => {
  it("con un show lleva a su ficha", () => {
    expect(urlDelAviso(uno)).toBe(`${SITE_URL}/concierto/jairo-gran-rex`);
  });

  // No hay una página que contenga varios shows sueltos, así que la agenda es
  // el destino honesto: mandar a la ficha del primero esconde los otros.
  it("con varios lleva a la agenda", () => {
    expect(urlDelAviso(varios(3))).toBe(`${SITE_URL}/agenda`);
  });

  it("sin slug cae al home en vez de armar una URL rota", () => {
    const sinSlug: AvisoPush = {
      sub: uno.sub,
      conciertos: [{ artista: "Jairo", concierto: concierto("Jairo", "x", { slug: null }) }],
    };
    expect(urlDelAviso(sinSlug)).toBe(SITE_URL);
  });
});

describe("payloadDelAviso", () => {
  // El service worker no puede consultar nada: lo que no venga acá, no existe.
  it("trae todo lo que el service worker necesita", () => {
    const payload = JSON.parse(payloadDelAviso(uno));
    expect(payload).toMatchObject({
      title: "Jairo anunció un show",
      url: `${SITE_URL}/concierto/jairo-gran-rex`,
      tag: "misconciertos-artista",
    });
    expect(payload.body).toContain("Teatro Gran Rex");
  });

  // El tope de un cuerpo encriptado es ~3993 bytes. Con muchos artistas el
  // payload igual queda chico porque se cuenta en vez de listar, y este test es
  // el que avisa si alguien cambia eso por una lista completa.
  it("no crece con la cantidad de artistas", () => {
    expect(payloadDelAviso(varios(50)).length).toBeLessThan(400);
  });
});
