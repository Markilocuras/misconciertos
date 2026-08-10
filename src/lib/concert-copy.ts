// Texto de la ficha de concierto compuesto a partir de los datos de la fila.
//
// Hasta agosto de 2026 la descripción la fabricaba el scraper como
// `Concierto en ${venue}.`, así que las 31 fichas del Movistar Arena decían
// exactamente lo mismo. Entre eso y la plantilla compartida, cada página tenía
// ~15 palabras propias sobre 123, y Google se las quedaba en "Descubierta:
// actualmente sin indexar". Acá se arma una descripción que sí cambia entre
// fichas, sin inventar nada que no esté en la fila.

import type { Concert } from "@/data/concerts";

/** "lunes 17 de agosto de 2026" — sin la coma, que en prosa queda mal. */
export function formatDateLong(date: string): string {
  return new Date(`${date}T00:00`)
    .toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .replace(",", "");
}

/** "17 de agosto" */
export function formatDayMonth(date: string): string {
  return new Date(`${date}T00:00`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });
}

/** "17 de agosto 2026" — para el <title>, donde el año sí se busca. */
export function formatDayMonthYear(date: string): string {
  return `${formatDayMonth(date)} ${date.slice(0, 4)}`;
}

function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * "13, 14 y 26 de noviembre" cuando caen todas en el mismo mes; si no,
 * "30 de agosto y 2 de septiembre".
 */
export function formatDateList(dates: string[]): string {
  if (!dates.length) return "";
  const sameMonth = new Set(dates.map((d) => d.slice(0, 7))).size === 1;
  if (sameMonth) {
    const month = new Date(`${dates[0]}T00:00`).toLocaleDateString("es-AR", { month: "long" });
    return `${joinEs(dates.map((d) => String(Number(d.slice(8, 10)))))} de ${month}`;
  }
  return joinEs(dates.map(formatDayMonth));
}

/**
 * Párrafo de apertura de la ficha. `runDates` son todas las fechas de la tanda
 * (ver concert-runs.ts), incluida la de este concierto.
 */
export function concertSummary(concert: Concert, runDates: string[]): string {
  const who = concert.artist || concert.title;
  const sentences: string[] = [];

  let opening = `${who} toca en ${concert.venue || "Buenos Aires"} el ${formatDateLong(concert.date)}`;
  if (concert.time) opening += ` a las ${concert.time} hs`;
  sentences.push(`${opening}.`);

  if (concert.price) {
    sentences.push(`Las entradas arrancan en ${concert.price}.`);
  }

  const otherDates = runDates.filter((d) => d !== concert.date);
  if (otherDates.length) {
    sentences.push(
      `Es una de las ${runDates.length} funciones que ${who} hace en ${concert.venue}: ` +
        `también toca el ${formatDateList(otherDates)}.`,
    );
  }

  return sentences.join(" ");
}

// Las fichas viejas todavía tienen guardada la descripción que fabricaba el
// scraper. Se limpia sola en el próximo ingest completo, pero hasta entonces no
// queremos mostrarla. Cuando `concerts.description` esté vacío en toda la tabla,
// esta función y su uso se pueden borrar.
const LEGACY_DESCRIPTION = /^Concierto en .+\.$/;

/** La descripción scrapeada, si es real y no la plantilla vieja. */
export function realDescription(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed || LEGACY_DESCRIPTION.test(trimmed)) return null;
  return trimmed;
}
