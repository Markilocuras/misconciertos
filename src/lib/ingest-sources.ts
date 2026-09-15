// Qué fuentes corre una invocación de la ingesta, y cuántos fetches le tocan a
// cada una. Está separado del handler porque es la parte que hay que poder
// testear: el presupuesto de subrequests de Cloudflare es el límite real de la
// ingesta y ya nos rompió dos corridas enteras en silencio.

// Las fuentes, en el orden en que corren.
//
// allevents va última a propósito. Es la menos autoritativa —republica lo que
// ya venden las ticketeras— y la única que se cruza contra lo que hay en la
// base para no duplicar. Corriendo al final ve lo que las otras cuatro
// acaban de escribir; corriendo primera, como hasta ahora, se cruzaba contra
// datos de doce horas antes y podía meter un duplicado de un show que la
// ticketera cargaba cinco minutos después.
export const INGEST_SOURCES = [
  "allaccess",
  "daleplay",
  "ticketek",
  "livepass",
  "tuentrada",
  "allevents",
] as const;

export type IngestSource = (typeof INGEST_SOURCES)[number];

export type SourceSelection =
  { ok: true; sources: IngestSource[]; solo: boolean } | { ok: false; error: string };

// `?source=` vacío o ausente corre las cinco (modo manual, y el que usa
// `?debug=1` para mirar todo de una). El cron manda una fuente por invocación.
export function selectSources(raw: string | null | undefined): SourceSelection {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return { ok: true, sources: [...INGEST_SOURCES], solo: false };

  const match = INGEST_SOURCES.find((s) => s === value);
  if (!match) {
    return {
      ok: false,
      error: `source desconocida: "${value}". Validas: ${INGEST_SOURCES.join(", ")}`,
    };
  }
  return { ok: true, sources: [match], solo: true };
}

// ---------------------------------------------------------------------------
// Presupuesto de subrequests
//
// Cloudflare corta la invocación del Worker por cantidad de subrequests, y ahí
// entra todo: los fetches a las fuentes, cada llamada a Supabase y cada mail.
// Cuando se pasa, lo que corre último devuelve 0 y el mail de aviso falla, las
// dos cosas sin un solo error en el log. Por eso existen los topes de fetches,
// y por eso hay un test que verifica que el peor caso entra.
//
// El 14/09/2026 la cuenta pasó al plan Workers Paid y el techo pasó de 50 a
// 1000. Eso cambia la escala del problema: 50 era una restricción que moldeaba
// toda la ingesta —partirla por fuente, sacar Spotify del camino, topes de 8
// páginas que tardaban diez corridas en cargar Live Pass—; 1000 alcanza de
// sobra para que cada fuente recorra su listado entero en una sola corrida.
//
// El límite sigue existiendo y el test sigue estando: 1000 es mucho, no es
// infinito, y una fuente que un día publique 3000 eventos lo encuentra.
// ---------------------------------------------------------------------------

export const TOPE_SUBREQUESTS = 1000;

// Lo que gasta la invocación fuera de las fuentes: leer el secreto del cron,
// leer las filas conocidas, un upsert por fuente que traiga algo, y los dos
// que puede costar el mail de aviso si alguna vino vacía.
export function overheadSubrequests(cantidadDeFuentes: number): number {
  return 2 + cantidadDeFuentes + 2;
}

export type Topes = {
  allaccessEventos: number;
  ticketekArtistas: number;
  ticketekShows: number;
  livepassEventos: number;
  tuentradaEventos: number;
};

/**
 * Los topes, dimensionados para cubrir el listado entero de cada fuente.
 *
 * Hoy Live Pass publica ~88 links, All Access ~25 y Ticketek ~63 ítems: con
 * estos números cualquiera de las tres entra completa en una corrida, y sobra
 * margen para que crezcan al doble sin que nadie tenga que tocar esto.
 *
 * Antes había dos juegos, uno para la fuente sola y otro más chico para las
 * cinco juntas, porque con 50 subrequests había que repartir. Con 1000 no hace
 * falta: los dos modos entran con los mismos topes, así que quedó uno solo.
 */
export const TOPES: Topes = {
  allaccessEventos: 120,
  ticketekArtistas: 40,
  ticketekShows: 120,
  livepassEventos: 150,
  tuentradaEventos: 90,
};

// Peor caso de fetches a la fuente, con todos los topes llenos.
export function fetchesMaximos(source: IngestSource, topes: Topes): number {
  switch (source) {
    // Los dos listados de allevents; no abre página de evento.
    case "allevents":
      return 2;
    // La home más una página por evento nuevo.
    case "allaccess":
      return 1 + topes.allaccessEventos;
    // Un solo listado con todo adentro.
    case "daleplay":
      return 1;
    // La lista de música, más las páginas de artista, más las de show.
    case "ticketek":
      return 1 + topes.ticketekArtistas + topes.ticketekShows;
    // El listado más una página por evento nuevo.
    case "livepass":
      return 1 + topes.livepassEventos;
    // La home —que es el listado real—, los cuatro listados de categorias que
    // se usan como lista de exclusion, y una pagina por evento nuevo.
    case "tuentrada":
      return 1 + 4 + topes.tuentradaEventos;
  }
}

// Lo que gastaría, como techo, una invocación que corre estas fuentes.
export function subrequestsPeorCaso(sources: readonly IngestSource[], topes: Topes): number {
  return (
    overheadSubrequests(sources.length) +
    sources.reduce((total, s) => total + fetchesMaximos(s, topes), 0)
  );
}
