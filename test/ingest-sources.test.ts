import { describe, it, expect } from "vitest";

import {
  INGEST_SOURCES,
  TOPES,
  TOPE_SUBREQUESTS,
  selectSources,
  subrequestsPeorCaso,
} from "@/lib/ingest-sources";

describe("selectSources", () => {
  it("sin parametro corre las cinco fuentes", () => {
    const sel = selectSources(null);
    expect(sel).toMatchObject({ ok: true, solo: false });
    if (sel.ok) expect(sel.sources).toEqual([...INGEST_SOURCES]);
  });

  it("trata el string vacio como ausente", () => {
    for (const raw of ["", "   "]) {
      const sel = selectSources(raw);
      expect(sel.ok).toBe(true);
      if (sel.ok) expect(sel.sources).toHaveLength(INGEST_SOURCES.length);
    }
  });

  it("con una fuente valida corre solo esa", () => {
    const sel = selectSources("livepass");
    expect(sel).toMatchObject({ ok: true, solo: true });
    if (sel.ok) expect(sel.sources).toEqual(["livepass"]);
  });

  it("ignora mayusculas y espacios de mas", () => {
    const sel = selectSources("  TicketeK  ");
    expect(sel).toMatchObject({ ok: true, solo: true });
    if (sel.ok) expect(sel.sources).toEqual(["ticketek"]);
  });

  // Un typo en el cron no puede terminar en una corrida que no hace nada y
  // devuelve 200: el handler contesta 400 con la lista de fuentes validas.
  it("rechaza una fuente desconocida", () => {
    const sel = selectSources("tickettek");
    expect(sel.ok).toBe(false);
    if (!sel.ok) {
      expect(sel.error).toContain("tickettek");
      expect(sel.error).toContain("ticketek");
    }
  });

  it("allevents corre ultima, despues de las ticketeras", () => {
    expect(INGEST_SOURCES[INGEST_SOURCES.length - 1]).toBe("allevents");
  });
});

// El presupuesto de subrequests es el limite real de la ingesta y se pasa en
// silencio: cuando revienta, lo que corre ultimo devuelve 0 y el mail de aviso
// falla, sin un solo error en el log. Estos dos tests son el unico lugar donde
// se nota antes de tiempo si alguien sube un tope.
describe("presupuesto de subrequests", () => {
  it("cada fuente sola entra en el techo de Cloudflare", () => {
    for (const source of INGEST_SOURCES) {
      expect(subrequestsPeorCaso([source], TOPES)).toBeLessThanOrEqual(TOPE_SUBREQUESTS);
    }
  });

  // Con 1000 no hace falta un juego de topes mas chico para el modo manual:
  // las cinco juntas entran con los mismos numeros que una sola.
  it("las cinco juntas tambien entran, con los mismos topes", () => {
    expect(subrequestsPeorCaso(INGEST_SOURCES, TOPES)).toBeLessThanOrEqual(TOPE_SUBREQUESTS);
  });

  // El techo subio de 50 a 1000 pero no desaparecio, y este es el test que lo
  // recuerda. Con los topes de hoy el peor caso queda bien abajo: si alguien
  // los sube hasta rozarlo, que sea con esto en rojo y no con una corrida que
  // devuelve cero en silencio.
  it("deja margen de sobra, no entra raspando", () => {
    const peorCaso = subrequestsPeorCaso(INGEST_SOURCES, TOPES);
    expect(peorCaso).toBeLessThan(TOPE_SUBREQUESTS * 0.75);
  });

  // Los topes tienen que alcanzar para el listado entero de cada fuente, que es
  // todo el punto de haber pasado al plan pago: hoy Live Pass publica ~88
  // links, All Access ~25 y Ticketek ~63 items.
  it("los topes cubren de sobra lo que las fuentes publican hoy", () => {
    expect(TOPES.livepassEventos).toBeGreaterThanOrEqual(88);
    expect(TOPES.allaccessEventos).toBeGreaterThanOrEqual(25);
    expect(TOPES.ticketekArtistas + TOPES.ticketekShows).toBeGreaterThanOrEqual(63);
  });
});
