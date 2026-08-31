// La app es sobre recitales en Buenos Aires, así que "hoy" es hoy acá, no
// donde esté corriendo el server ni donde esté mirando el visitante.
//
// Esto importa más de lo que parece. `new Date().toISOString()` da UTC y
// Buenos Aires es UTC-3: un "hoy" calculado en UTC se adelanta al día
// siguiente a las 21:00 hora local. Con eso, los recitales de esta noche
// desaparecían del mapa tres horas antes de que empezaran, justo en la franja
// en la que alguien entra a buscar a qué ir.
export const TIMEZONE = "America/Argentina/Buenos_Aires";

// en-CA formatea como YYYY-MM-DD, que es exactamente el formato de la columna
// `date` de concerts y el que compara PostgREST en los .gte()/.lte().
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** El día de hoy en Buenos Aires, como "YYYY-MM-DD". */
export function todayInBuenosAires(now: Date = new Date()): string {
  return DAY_FORMAT.format(now);
}
