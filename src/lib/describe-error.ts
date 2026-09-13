/**
 * Convierte cualquier cosa que se haya tirado en texto que sirva para algo.
 *
 * Existe por un mail de aviso que decía, entero: "allaccess — falló con:
 * [object Object]". El catch hacía `err instanceof Error ? err.message :
 * String(err)`, que es lo razonable hasta que te acordás de qué tira
 * supabase-js: un PostgrestError, que es un objeto plano `{message, code,
 * details, hint}` y no una subclase de Error. `String()` sobre eso da
 * "[object Object]", así que toda falla de escritura en la base llegaba sin una
 * sola palabra de información — que es justo cuando más falta hace.
 *
 * El orden de los campos no es casual: `message` primero porque es lo único que
 * se lee de un vistazo desde el teléfono, y `hint` último porque Postgres lo
 * llena con sugerencias largas.
 */

// El aviso se lee en un mail y en el JSON de la corrida: un stack de Postgres
// de 4 KB no ayuda en ninguno de los dos. Se corta y se avisa que se cortó.
const MAX_LARGO = 300;

function texto(err: unknown): string {
  if (err instanceof Error) {
    // Un Error con message vacío existe y es peor que inútil: al menos el name
    // dice de qué tipo fue.
    return err.message || err.name || "Error sin mensaje";
  }
  if (typeof err === "string") return err || "(string vacío)";
  if (err === null || err === undefined) return String(err);

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const campo = (k: string): string | null => {
      const v = o[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const code = campo("code");
    const partes = [campo("message"), code ? `code ${code}` : null, campo("details"), campo("hint")]
      .filter((p): p is string => p !== null)
      .filter((p, i, todas) => todas.indexOf(p) === i);

    if (partes.length > 0) return partes.join(" — ");

    // Sin ninguno de esos campos, el JSON crudo sigue siendo mejor que
    // "[object Object]": al menos se ve qué forma tenía.
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      // referencias circulares: se cae al String() de abajo
    }
  }

  return String(err);
}

export function describeError(err: unknown): string {
  const t = texto(err);
  return t.length > MAX_LARGO ? `${t.slice(0, MAX_LARGO - 1)}…` : t;
}
