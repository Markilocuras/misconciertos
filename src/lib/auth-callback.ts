// Qué trae la URL cuando el navegador vuelve del link del mail de confirmación.
//
// El alta usa el flujo implícito, que es el default de supabase-js: el link del
// mail rebota en `/auth/v1/verify` y deja al visitante en el `emailRedirectTo`
// —el mapa— con el resultado en el fragmento. Sale bien y viene
// `#access_token=...&type=signup`; el link venció y viene
// `#error=access_denied&error_code=otp_expired`.
//
// **El fragmento se lee acá, en tiempo de import, y no adentro de un efecto.**
// `detectSessionInUrl` viene prendido, así que el cliente de supabase-js se
// queda con los tokens y borra la URL con `replaceState` apenas alguien lo
// instancia —cosa que pasa en el primer efecto que toca `supabase.auth`—. Este
// módulo lo importa la ruta del mapa, que se evalúa antes de que corra ningún
// efecto, así que para cuando haya que mostrar el aviso el dato ya está
// guardado. Dentro de un efecto sería una carrera contra el cliente de auth.
export type VueltaDelMail =
  { estado: "confirmado" } | { estado: "vencido" } | { estado: "error"; detalle: string };

/**
 * Lee el fragmento que dejó Supabase. Separada de `window` para poder probarla:
 * lo que puede salir mal acá —tomar por confirmación un fragmento que no lo es,
 * o mostrar "confirmado" cuando el link venció— no se ve hasta que le pasa a
 * alguien, porque la única forma de llegar a este código es un mail real.
 */
export function interpretarFragmento(fragmento: string): VueltaDelMail | null {
  if (fragmento.length < 2) return null;

  const params = new URLSearchParams(fragmento.replace(/^#/, ""));

  const error = params.get("error") ?? params.get("error_code");
  if (error) {
    const descripcion = params.get("error_description") ?? "";
    // Un link vencido es el caso normal —el mail quedó sin abrir un día— y
    // tiene su propia salida: pedir otro. El resto es raro y se muestra crudo.
    if (params.get("error_code") === "otp_expired" || /expired|invalid/i.test(descripcion)) {
      return { estado: "vencido" };
    }
    return { estado: "error", detalle: descripcion || error };
  }

  // `type` viaja con los tokens y dice de qué mail volvimos. Hoy el único que
  // mandamos es el del alta; si algún día hay recuperar contraseña, va acá.
  if (params.get("type") === "signup" && params.get("access_token")) {
    return { estado: "confirmado" };
  }

  return null;
}

let pendiente = typeof window === "undefined" ? null : interpretarFragmento(window.location.hash);

/**
 * La vuelta del mail, una sola vez. Se consume al leerla para que el aviso no
 * reaparezca cada vez que el mapa se vuelve a montar (volver desde la ficha de
 * un concierto, por ejemplo), que sería avisar dos veces de lo mismo.
 */
export function tomarVueltaDelMail(): VueltaDelMail | null {
  const vuelta = pendiente;
  pendiente = null;
  return vuelta;
}
