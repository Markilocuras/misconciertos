import { describe, expect, it } from "vitest";

import { interpretarFragmento } from "@/lib/auth-callback";

// Confirmar el mail termina en el mapa, y el mapa no cambia: el único indicio
// de que el link hizo algo es el aviso que sale de acá. Por eso va con test
// aunque sean cuatro ramas — equivocarse no tira ningún error, deja al
// visitante sin saber si su cuenta quedó activa, y sólo se descubre mandando
// un mail de verdad.

describe("interpretarFragmento", () => {
  it("reconoce la vuelta del mail de alta", () => {
    const fragmento =
      "#access_token=eyJhbGciOiJIUzI1NiJ9.abc&expires_in=3600&refresh_token=x7q&token_type=bearer&type=signup";
    expect(interpretarFragmento(fragmento)).toEqual({ estado: "confirmado" });
  });

  it("reconoce el link vencido", () => {
    const fragmento =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    expect(interpretarFragmento(fragmento)).toEqual({ estado: "vencido" });
  });

  it("devuelve el detalle de un error que no es el link vencido", () => {
    const fragmento = "#error=server_error&error_description=Database+error+saving+new+user";
    expect(interpretarFragmento(fragmento)).toEqual({
      estado: "error",
      detalle: "Database error saving new user",
    });
  });

  it("ignora una URL sin fragmento", () => {
    expect(interpretarFragmento("")).toBeNull();
    expect(interpretarFragmento("#")).toBeNull();
  });

  // Un `type` sin tokens no es una confirmación: es cualquier otra cosa que
  // haya quedado en el fragmento. Avisar ahí sería prometer una cuenta activa
  // que no existe.
  it("no toma por confirmación un fragmento sin tokens", () => {
    expect(interpretarFragmento("#type=signup")).toBeNull();
    expect(interpretarFragmento("#seccion=agenda")).toBeNull();
  });

  // El error viene primero aunque el fragmento traiga también un type: si algo
  // falló, lo que hay que decir es que falló.
  it("prioriza el error sobre el type", () => {
    expect(interpretarFragmento("#type=signup&error=access_denied&error_code=otp_expired")).toEqual(
      { estado: "vencido" },
    );
  });
});
