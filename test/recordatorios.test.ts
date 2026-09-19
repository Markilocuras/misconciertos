import { describe, expect, it } from "vitest";

import {
  agruparRecordatorios,
  cuerpoDelRecordatorio,
  payloadDelRecordatorio,
  tituloDelRecordatorio,
  urlDelRecordatorio,
  type RecordatorioPush,
} from "@/lib/push.server";
import { SITE_URL } from "@/lib/site";
import { sumarDias, todayInBuenosAires, tomorrowInBuenosAires } from "@/lib/timezone";

// El recordatorio del día anterior es la promesa del botón "Avisame de este
// show". Dice algo distinto al aviso de shows nuevos y por eso tiene su propio
// texto: acá se verifica que no se mezclen.

const TELEFONO = "https://fcm.googleapis.com/fcm/send/telefono";
const COMPU = "https://updates.push.services.mozilla.com/wpush/v2/compu";

const sub = (endpoint: string) => ({ endpoint, p256dh: "x", auth: "y" });

const concierto = (artist: string, slug: string, extra: Record<string, unknown> = {}) => ({
  title: artist,
  artist,
  venue: "Teatro Gran Rex",
  date: "2026-11-07",
  time: "21:00",
  slug,
  ...extra,
});

describe("sumarDias / tomorrowInBuenosAires", () => {
  it("suma un día sin salirse del calendario", () => {
    expect(sumarDias("2026-11-07", 1)).toBe("2026-11-08");
  });

  it("cruza fin de mes y fin de año", () => {
    expect(sumarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("cruza un 29 de febrero bisiesto", () => {
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2028-02-29", 1)).toBe("2028-03-01");
  });

  // La suite corre en UTC y Buenos Aires es UTC-3: a las 23:00 del 7 en UTC
  // todavía son las 20:00 del 7 acá, así que mañana es el 8 y no el 9.
  it("mañana es el día después de hoy en Buenos Aires, no en UTC", () => {
    const nocheUtc = new Date("2026-11-08T01:30:00Z"); // 22:30 del 7 en Buenos Aires
    expect(todayInBuenosAires(nocheUtc)).toBe("2026-11-07");
    expect(tomorrowInBuenosAires(nocheUtc)).toBe("2026-11-08");
  });
});

describe("agruparRecordatorios", () => {
  it("junta en un aviso los shows de mañana del mismo dispositivo", () => {
    const rs = agruparRecordatorios([
      { sub: sub(TELEFONO), concierto: concierto("Jairo", "jairo") },
      { sub: sub(TELEFONO), concierto: concierto("Dillom", "dillom") },
    ]);
    expect(rs).toHaveLength(1);
    expect(rs[0].conciertos).toHaveLength(2);
  });

  it("no mezcla dos dispositivos", () => {
    const rs = agruparRecordatorios([
      { sub: sub(TELEFONO), concierto: concierto("Jairo", "jairo") },
      { sub: sub(COMPU), concierto: concierto("Jairo", "jairo") },
    ]);
    expect(rs).toHaveLength(2);
  });

  it("no repite el mismo show", () => {
    const mismo = concierto("Jairo", "jairo");
    const rs = agruparRecordatorios([
      { sub: sub(TELEFONO), concierto: mismo },
      { sub: sub(TELEFONO), concierto: mismo },
    ]);
    expect(rs[0].conciertos).toHaveLength(1);
  });
});

const uno: RecordatorioPush = {
  sub: sub(TELEFONO),
  conciertos: [concierto("Jairo", "jairo-gran-rex")],
};

const dos: RecordatorioPush = {
  sub: sub(TELEFONO),
  conciertos: [concierto("Jairo", "jairo"), concierto("Dillom", "dillom")],
};

describe("texto del recordatorio", () => {
  it("con un show dice de quién es", () => {
    expect(tituloDelRecordatorio(uno)).toBe("Mañana: Jairo");
  });

  it("con varios cuenta cuántos", () => {
    expect(tituloDelRecordatorio(dos)).toBe("Mañana tenés 2 shows");
  });

  // La fecha no va en el cuerpo: el título ya dijo "mañana" y en una
  // notificación el espacio es todo lo que hay.
  it("el cuerpo trae lugar y hora, no la fecha", () => {
    const cuerpo = cuerpoDelRecordatorio(uno);
    expect(cuerpo).toBe("Teatro Gran Rex · 21:00 hs");
    expect(cuerpo).not.toContain("noviembre");
  });

  it("con varios lista los artistas", () => {
    expect(cuerpoDelRecordatorio(dos)).toBe("Jairo, Dillom");
  });

  it("no se rompe con un show sin hora", () => {
    const sinHora: RecordatorioPush = {
      sub: sub(TELEFONO),
      conciertos: [concierto("Jairo", "jairo", { time: null })],
    };
    expect(cuerpoDelRecordatorio(sinHora)).toBe("Teatro Gran Rex");
  });

  it("con un show lleva a su ficha, con varios a la agenda", () => {
    expect(urlDelRecordatorio(uno)).toBe(`${SITE_URL}/concierto/jairo-gran-rex`);
    expect(urlDelRecordatorio(dos)).toBe(`${SITE_URL}/agenda`);
  });
});

describe("payloadDelRecordatorio", () => {
  // Dos tags distintos: un recordatorio de mañana no tiene que pisar el aviso
  // de un show recién anunciado. Son dos cosas y las dos importan.
  it("usa un tag propio, distinto al de los avisos de artista", () => {
    const recordatorio = JSON.parse(payloadDelRecordatorio(uno));
    expect(recordatorio.tag).toBe("misconciertos-recordatorio");
    expect(recordatorio.title).toBe("Mañana: Jairo");
    expect(recordatorio.url).toBe(`${SITE_URL}/concierto/jairo-gran-rex`);
  });

  it("entra holgado en el tope de un cuerpo encriptado", () => {
    const muchos: RecordatorioPush = {
      sub: sub(TELEFONO),
      conciertos: Array.from({ length: 30 }, (_, i) => concierto(`Artista ${i}`, `a-${i}`)),
    };
    expect(payloadDelRecordatorio(muchos).length).toBeLessThan(400);
  });
});
