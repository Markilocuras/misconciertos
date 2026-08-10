// Un artista que hace varias funciones en el mismo venue genera una página por
// fecha, y esas páginas son casi idénticas entre sí: cambia un token de fecha.
// Google las lee como duplicados y no indexa ninguna ("Duplicada: el usuario no
// ha indicado ninguna versión canónica"). En agosto de 2026 eso eran 8 páginas
// de María Becerra, 6 de Morat y 5 del Festival Patria, sobre 82 fichas totales.
//
// La solución es agrupar esas fechas en una "tanda" (run) y canonicalizar todas
// hacia la primera, que es la que lista todas las fechas de la tanda.

// Dos funciones del mismo artista en el mismo venue separadas por más que esto
// no son la misma tanda: son dos giras distintas y cada una merece su página.
const RUN_GAP_DAYS = 30;

export type RunRow = {
  id: string;
  slug: string | null;
  artist: string | null;
  venue: string | null;
  date: string | null;
};

export type RunInfo<T> = {
  /** Slug de la primera función de la tanda: a esa apunta el canonical. */
  canonicalSlug: string;
  /** Todas las funciones de la tanda, incluida la actual, por fecha. */
  run: T[];
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Indexa por id de concierto a qué tanda pertenece y cuál es su canónica.
 * Recibe filas ya filtradas (típicamente los conciertos futuros): el sitemap le
 * pasa todas, la ficha solo las del mismo artista y venue.
 */
export function buildRunIndex<T extends RunRow>(rows: T[]): Map<string, RunInfo<T>> {
  const index = new Map<string, RunInfo<T>>();
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    // Sin artista, venue, fecha o slug no hay con qué agrupar ni a dónde
    // canonicalizar: cada fila es su propia tanda.
    if (!row.artist || !row.venue || !row.date || !row.slug) {
      index.set(row.id, { canonicalSlug: row.slug ?? "", run: [row] });
      continue;
    }
    const key = `${row.artist}|${row.venue}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.date!.localeCompare(b.date!));

    let cluster: T[] = [];
    const flush = () => {
      if (!cluster.length) return;
      const canonicalSlug = cluster[0].slug!;
      const run = cluster;
      for (const row of run) index.set(row.id, { canonicalSlug, run });
      cluster = [];
    };

    for (const row of group) {
      const previous = cluster[cluster.length - 1];
      if (previous && daysBetween(previous.date!, row.date!) > RUN_GAP_DAYS) flush();
      cluster.push(row);
    }
    flush();
  }

  return index;
}
