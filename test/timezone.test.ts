import { describe, expect, it } from "vitest";
import { TIMEZONE, todayInBuenosAires } from "@/lib/timezone";

// Buenos Aires es UTC-3, así que un "hoy" sacado de toISOString() se adelanta al
// día siguiente a las 21:00 hora local. Con eso, los recitales de esa misma
// noche se caían del filtro .gte("date", today) y desaparecían del mapa tres
// horas antes de empezar, justo cuando alguien entra a ver a qué ir.

describe("todayInBuenosAires", () => {
  it("apunta a la zona horaria de Buenos Aires", () => {
    expect(TIMEZONE).toBe("America/Argentina/Buenos_Aires");
  });

  it("sigue siendo hoy después de las 21:00, que es donde estaba el bug", () => {
    // 21:00 en Buenos Aires ya es el día siguiente en UTC.
    expect(todayInBuenosAires(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08-30");
    expect(todayInBuenosAires(new Date("2026-08-31T02:59:59Z"))).toBe("2026-08-30");
  });

  it("recién cambia de día a la medianoche local", () => {
    expect(todayInBuenosAires(new Date("2026-08-31T02:59:59Z"))).toBe("2026-08-30");
    expect(todayInBuenosAires(new Date("2026-08-31T03:00:00Z"))).toBe("2026-08-31");
  });

  it("no se corre durante el día", () => {
    expect(todayInBuenosAires(new Date("2026-08-30T13:00:00Z"))).toBe("2026-08-30");
    expect(todayInBuenosAires(new Date("2026-08-30T23:59:00Z"))).toBe("2026-08-30");
  });

  it("devuelve el formato que compara PostgREST contra la columna date", () => {
    expect(todayInBuenosAires(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
    expect(todayInBuenosAires()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("cruza bien el fin de año", () => {
    // 31/12 a las 22:00 en Buenos Aires ya es 1/1 en UTC: si el año se tomara de
    // UTC, el sitio saltaría de año una noche antes.
    expect(todayInBuenosAires(new Date("2027-01-01T01:00:00Z"))).toBe("2026-12-31");
  });
});
