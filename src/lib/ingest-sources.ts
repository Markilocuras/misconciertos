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
// Cloudflare corta la invocación del Worker a los 50 subrequests, y ahí entra
// todo: los fetches a las fuentes, cada llamada a Supabase y cada mail. Cuando
// se pasa, lo que corre último devuelve 0 y el mail de aviso falla, las dos
// cosas sin un solo error en el log. Por eso los topes de fetches existen, y
// por eso hay un test que verifica que el peor caso de cada modo entra.
// ---------------------------------------------------------------------------

export const TOPE_SUBREQUESTS = 50;

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
};

// Una fuente sola tiene los 50 para ella, así que los topes pueden ser
// generosos. Es todo el punto de partir la ingesta: con el tope viejo de 8,
// las ~76 fechas de Live Pass tardaban unas diez corridas en entrar; con 30
// entran en dos.
export const TOPES_SOLO: Topes = {
  allaccessEventos: 30,
  ticketekArtistas: 10,
  ticketekShows: 22,
  livepassEventos: 30,
};

// Las cinco juntas en una sola invocación se reparten los mismos 50, así que
// acá los topes son chicos por obligación. Este modo quedó para correr a mano
// y para `?debug=1`; el cron usa el de arriba, una fuente por invocación.
export const TOPES_JUNTAS: Topes = {
  allaccessEventos: 12,
  ticketekArtistas: 5,
  ticketekShows: 8,
  livepassEventos: 6,
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
  }
}

// Lo que gastaría, como techo, una invocación que corre estas fuentes.
export function subrequestsPeorCaso(sources: readonly IngestSource[], topes: Topes): number {
  return (
    overheadSubrequests(sources.length) +
    sources.reduce((total, s) => total + fetchesMaximos(s, topes), 0)
  );
}
