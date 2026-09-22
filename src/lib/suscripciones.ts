import { slugify } from "@/lib/ingest-parsers";

/**
 * Las cuentas de quién dejó su mail y para qué, aparte del server fn que las
 * lee: son puras y se testean sin base.
 *
 * Los mails son tres promesas distintas y se cuentan por separado porque no
 * significan lo mismo: el resumen diario va a todos, el aviso por artista sale
 * cuando ese artista anuncia algo, y el recordatorio de show sale una vez y
 * después esa fila no vuelve a servir para nada.
 */

/** Una fila de `artist_alerts`, sólo lo que hace falta para contar. */
export type FilaAvisoArtista = {
  artist: string;
  email: string;
  created_at: string;
};

/** Una fila de `show_email_reminders` con el concierto embebido. */
export type FilaRecordatorioShow = {
  concert_id: string;
  email: string;
  created_at: string;
  reminded_at: string | null;
  concerts: {
    title: string;
    venue: string | null;
    date: string | null;
    slug: string | null;
  } | null;
};

export type ArtistaSeguido = {
  slug: string;
  /** Cómo lo escribe la mayoría de las suscripciones. */
  artist: string;
  /** Las otras grafías del mismo artista, si las hay. */
  variantes: string[];
  personas: number;
  ultima: string;
};

export type ShowSeguido = {
  concert_id: string;
  title: string;
  venue: string | null;
  date: string | null;
  slug: string | null;
  personas: number;
  /** A cuántas ya les salió el recordatorio (`reminded_at`). */
  avisados: number;
  ultima: string;
};

// El dominio de un mail no distingue mayúsculas y el usuario tampoco en la
// práctica: "Yo@x.com" y "yo@x.com" son dos filas —el UNIQUE de la tabla es
// sensible a mayúsculas— pero una sola persona, y acá lo que se cuenta es
// gente.
const normalizar = (email: string) => email.trim().toLowerCase();

/** Cuántas personas distintas hay en total, sin importar por dónde entraron. */
export function contarPersonas(...listas: string[][]): number {
  const vistos = new Set<string>();
  for (const lista of listas) for (const email of lista) vistos.add(normalizar(email));
  return vistos.size;
}

/**
 * Los avisos por artista, agrupados igual que los agrupa el envío.
 *
 * La clave es el slug y no el nombre porque el cruce contra los conciertos
 * nuevos también es por slug (cada fuente escribe "CONOCIENDO RUSIA" o
 * "Conociendo Rusia" a su manera). Agrupar por el texto crudo partiría en dos
 * una audiencia que en realidad recibe un solo mail.
 */
export function resumirAvisosDeArtista(filas: FilaAvisoArtista[]): ArtistaSeguido[] {
  const grupos = new Map<string, { filas: FilaAvisoArtista[]; emails: Set<string> }>();

  for (const fila of filas) {
    const slug = slugify(fila.artist);
    if (!slug) continue;
    let grupo = grupos.get(slug);
    if (!grupo) {
      grupo = { filas: [], emails: new Set() };
      grupos.set(slug, grupo);
    }
    grupo.filas.push(fila);
    grupo.emails.add(normalizar(fila.email));
  }

  const resumen: ArtistaSeguido[] = [];
  for (const [slug, grupo] of grupos) {
    const porNombre = new Map<string, number>();
    for (const f of grupo.filas) porNombre.set(f.artist, (porNombre.get(f.artist) ?? 0) + 1);

    // La grafía más usada manda; empatadas, la primera alfabéticamente. Sin el
    // desempate, el nombre que se muestra dependería del orden en que volvió la
    // consulta.
    const nombres = [...porNombre.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    );

    resumen.push({
      slug,
      artist: nombres[0][0],
      variantes: nombres.slice(1).map(([nombre]) => nombre),
      personas: grupo.emails.size,
      ultima: grupo.filas.reduce((max, f) => (f.created_at > max ? f.created_at : max), ""),
    });
  }

  return resumen.sort((a, b) => b.personas - a.personas || (a.ultima < b.ultima ? 1 : -1));
}

/** Los recordatorios del día anterior, agrupados por show. */
export function resumirRecordatoriosDeShow(filas: FilaRecordatorioShow[]): ShowSeguido[] {
  const grupos = new Map<string, { filas: FilaRecordatorioShow[]; emails: Set<string> }>();

  for (const fila of filas) {
    let grupo = grupos.get(fila.concert_id);
    if (!grupo) {
      grupo = { filas: [], emails: new Set() };
      grupos.set(fila.concert_id, grupo);
    }
    grupo.filas.push(fila);
    grupo.emails.add(normalizar(fila.email));
  }

  const resumen: ShowSeguido[] = [];
  for (const [concert_id, grupo] of grupos) {
    const concierto = grupo.filas.find((f) => f.concerts)?.concerts ?? null;
    resumen.push({
      concert_id,
      // El concierto puede haberse borrado: la FK es ON DELETE CASCADE, así que
      // en teoría no pasa, pero la fila no se muestra vacía si pasara.
      title: concierto?.title ?? "(eliminado)",
      venue: concierto?.venue ?? null,
      date: concierto?.date ?? null,
      slug: concierto?.slug ?? null,
      personas: grupo.emails.size,
      avisados: grupo.filas.filter((f) => f.reminded_at).length,
      ultima: grupo.filas.reduce((max, f) => (f.created_at > max ? f.created_at : max), ""),
    });
  }

  // Por cuánta gente espera el aviso, no por fecha: lo que se viene mirando acá
  // es qué show junta público, y la fecha ya está en su columna.
  return resumen.sort(
    (a, b) => b.personas - a.personas || (a.date ?? "").localeCompare(b.date ?? ""),
  );
}
