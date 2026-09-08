import { describe, it, expect } from "vitest";

import {
  INGEST_SOURCES,
  TOPES_JUNTAS,
  TOPES_SOLO,
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
      expect(subrequestsPeorCaso([source], TOPES_SOLO)).toBeLessThanOrEqual(TOPE_SUBREQUESTS);
    }
  });

  it("las cinco juntas tambien entran, con los topes chicos", () => {
    expect(subrequestsPeorCaso(INGEST_SOURCES, TOPES_JUNTAS)).toBeLessThanOrEqual(TOPE_SUBREQUESTS);
  });

  // Si los topes de las cinco juntas fueran los de una sola, no entrarian: es
  // exactamente el estado del que venimos, y el motivo de partir la ingesta.
  it("las cinco juntas NO entrarian con los topes de una sola", () => {
    expect(subrequestsPeorCaso(INGEST_SOURCES, TOPES_SOLO)).toBeGreaterThan(TOPE_SUBREQUESTS);
  });
});
