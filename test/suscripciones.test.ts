import { describe, expect, it } from "vitest";

import {
  contarPersonas,
  resumirAvisosDeArtista,
  resumirRecordatoriosDeShow,
  type FilaRecordatorioShow,
} from "@/lib/suscripciones";

// El panel de admin contesta una pregunta que se responde con un número:
// cuánta gente espera un aviso. Que ese número sea de gente y no de filas es
// justamente lo que acá se puede equivocar en silencio —una fila de más no
// rompe nada, sólo miente— así que va con test.

const aviso = (artist: string, email: string, created_at: string) => ({
  artist,
  email,
  created_at,
});

describe("resumirAvisosDeArtista", () => {
  it("junta las grafías del mismo artista, porque el envío también las junta", () => {
    const resumen = resumirAvisosDeArtista([
      aviso("Conociendo Rusia", "ana@ejemplo.com", "2026-09-01T10:00:00Z"),
      aviso("CONOCIENDO RUSIA", "beto@ejemplo.com", "2026-09-05T10:00:00Z"),
    ]);

    expect(resumen).toHaveLength(1);
    expect(resumen[0].slug).toBe("conociendo-rusia");
    expect(resumen[0].personas).toBe(2);
    expect(resumen[0].ultima).toBe("2026-09-05T10:00:00Z");
  });

  it("muestra la grafía más usada y anota las otras", () => {
    const [artista] = resumirAvisosDeArtista([
      aviso("DILLOM", "ana@ejemplo.com", "2026-09-01T10:00:00Z"),
      aviso("Dillom", "beto@ejemplo.com", "2026-09-02T10:00:00Z"),
      aviso("Dillom", "cami@ejemplo.com", "2026-09-03T10:00:00Z"),
    ]);

    expect(artista.artist).toBe("Dillom");
    expect(artista.variantes).toEqual(["DILLOM"]);
  });

  it("cuenta una persona y no dos cuando se anotó con las dos grafías", () => {
    // Pasa de verdad: el UNIQUE es (artist, email) y "Dillom" no es "DILLOM",
    // así que la tabla acepta las dos filas. El mail, en cambio, sale uno solo.
    const [artista] = resumirAvisosDeArtista([
      aviso("Dillom", "ana@ejemplo.com", "2026-09-01T10:00:00Z"),
      aviso("DILLOM", "Ana@Ejemplo.com", "2026-09-02T10:00:00Z"),
    ]);

    expect(artista.personas).toBe(1);
  });

  it("ordena por cuánta gente sigue a cada uno", () => {
    const resumen = resumirAvisosDeArtista([
      aviso("Jairo", "ana@ejemplo.com", "2026-09-01T10:00:00Z"),
      aviso("Wos", "beto@ejemplo.com", "2026-09-02T10:00:00Z"),
      aviso("Wos", "cami@ejemplo.com", "2026-09-03T10:00:00Z"),
    ]);

    expect(resumen.map((a) => a.artist)).toEqual(["Wos", "Jairo"]);
  });

  it("descarta un artista que se slugifica en nada", () => {
    // Un nombre de puros signos no matchea ningún concierto: agruparlo bajo la
    // clave vacía juntaría cosas que no tienen nada que ver.
    expect(
      resumirAvisosDeArtista([aviso("¿?", "ana@ejemplo.com", "2026-09-01T10:00:00Z")]),
    ).toEqual([]);
  });
});

const concierto = {
  title: "Wos en Obras",
  venue: "Estadio Obras Sanitarias",
  date: "2026-11-07",
  slug: "wos-obras",
};

const recordatorio = (
  email: string,
  reminded_at: string | null,
  concerts: FilaRecordatorioShow["concerts"] = concierto,
): FilaRecordatorioShow => ({
  concert_id: "11111111-1111-1111-1111-111111111111",
  email,
  created_at: "2026-09-01T10:00:00Z",
  reminded_at,
  concerts,
});

describe("resumirRecordatoriosDeShow", () => {
  it("separa a quiénes ya les salió el aviso", () => {
    const [show] = resumirRecordatoriosDeShow([
      recordatorio("ana@ejemplo.com", "2026-11-06T11:30:00Z"),
      recordatorio("beto@ejemplo.com", null),
      recordatorio("cami@ejemplo.com", null),
    ]);

    expect(show.personas).toBe(3);
    expect(show.avisados).toBe(1);
    expect(show.title).toBe("Wos en Obras");
    expect(show.slug).toBe("wos-obras");
  });

  it("no deja la fila vacía si el concierto ya no está", () => {
    const [show] = resumirRecordatoriosDeShow([recordatorio("ana@ejemplo.com", null, null)]);

    expect(show.title).toBe("(eliminado)");
    expect(show.date).toBeNull();
  });
});

describe("contarPersonas", () => {
  it("cuenta una sola vez a quien está en dos listas", () => {
    expect(
      contarPersonas(
        ["ana@ejemplo.com", "beto@ejemplo.com"],
        ["ANA@ejemplo.com "],
        ["cami@ejemplo.com"],
      ),
    ).toBe(3);
  });

  it("sin nadie anotado da cero", () => {
    expect(contarPersonas([], [], [])).toBe(0);
  });
});
