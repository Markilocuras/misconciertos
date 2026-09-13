import { describe, expect, it } from "vitest";

import { describeError } from "@/lib/describe-error";

// El caso que originó todo esto: un mail de aviso que decía, entero,
// "allaccess — falló con: [object Object]". Toda falla de escritura en la base
// llegaba así, sin una palabra de información, que es justo cuando más falta
// hace.
describe("describeError", () => {
  it("desarma el PostgrestError de supabase, que es un objeto plano y no un Error", () => {
    // Forma real de lo que tira `if (error) throw error` después de un upsert.
    const postgrest = {
      message: "duplicate key value violates unique constraint",
      code: "23505",
      details: "Key (source, external_id)=(allaccess, x) already exists.",
      hint: "",
    };
    const texto = describeError(postgrest);

    expect(texto).not.toContain("[object Object]");
    expect(texto).toContain("duplicate key value");
    expect(texto).toContain("23505");
    expect(texto).toContain("already exists");
  });

  it("no inventa separadores cuando faltan campos", () => {
    expect(describeError({ message: "algo se rompió" })).toBe("algo se rompió");
    // hint vacío no aporta y no tiene que dejar un " — " colgando.
    expect(describeError({ message: "x", code: "P0001", details: "", hint: "" })).toBe(
      "x — code P0001",
    );
  });

  it("sigue haciendo lo obvio con un Error normal", () => {
    expect(describeError(new Error("GET https://allaccess.com.ar/ -> 503"))).toBe(
      "GET https://allaccess.com.ar/ -> 503",
    );
  });

  it("con un Error sin mensaje devuelve el tipo, que es mejor que vacío", () => {
    expect(describeError(new TypeError())).toBe("TypeError");
  });

  it("aguanta lo que se puede tirar además de un Error", () => {
    expect(describeError("se cayó")).toBe("se cayó");
    expect(describeError(null)).toBe("null");
    expect(describeError(undefined)).toBe("undefined");
    expect(describeError(42)).toBe("42");
  });

  // Sin message/code/details/hint, el JSON crudo al menos muestra qué forma
  // tenía. Cualquier cosa antes que "[object Object]".
  it("cae al JSON crudo antes que a [object Object]", () => {
    const texto = describeError({ status: 500, body: "nope" });
    expect(texto).not.toContain("[object Object]");
    expect(texto).toContain("500");
    expect(texto).toContain("nope");
  });

  it("no se cuelga con referencias circulares", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.yo = circular;
    expect(() => describeError(circular)).not.toThrow();
  });

  // Esto se lee en un mail y en el JSON de la corrida: un stack de Postgres de
  // 4 KB no sirve en ninguno de los dos.
  it("corta lo muy largo y avisa que cortó", () => {
    const texto = describeError(new Error("x".repeat(1000)));
    expect(texto.length).toBeLessThanOrEqual(300);
    expect(texto.endsWith("…")).toBe(true);
  });

  it("no corta lo que entra", () => {
    expect(describeError(new Error("corto"))).toBe("corto");
  });
});
