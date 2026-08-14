// Coordenadas conocidas de venues de Buenos Aires y alrededores.
// Compartido entre la ingesta (para geolocalizar eventos scrapeados) y el
// mapa (para saber si un pin corresponde a un escenario conocido).
//
// Auditadas contra OpenStreetMap en agosto de 2026, después de que un usuario
// reportara pines fuera de lugar. Las que quedaron son las que matchean un POI
// con nombre y dirección en OSM, salvo estas cuatro, que no se pudieron
// confirmar y siguen como estaban:
//
//   costa 21                 sin resultado en OSM
//   campo argentino de polo  solo el polígono del predio, 1,3 km del centroide
//   parque sarmiento         solo una calle homónima
//   geba                     solo el polígono del club, 356 m del centroide
//
// Para agregar o corregir una, buscar el POI en OSM y usar esa coordenada; no
// estimar a ojo, que es de donde salieron los errores que había.

export const VENUE_COORDS: Record<string, { lat: number; lng: number }> = {
  "movistar arena": { lat: -34.5953, lng: -58.4475 },
  "estadio luna park": { lat: -34.6022, lng: -58.3686 },
  "luna park": { lat: -34.6022, lng: -58.3686 },
  // Corrientes 857. Estaba 224 m corrido.
  "teatro gran rex": { lat: -34.6031, lng: -58.379 },
  "gran rex": { lat: -34.6031, lng: -58.379 },
  // Corrientes 860, enfrente del Gran Rex. Estaba 309 m corrido.
  "teatro opera": { lat: -34.6037, lng: -58.3789 },
  // Marcelo T. de Alvear 1125, Retiro. Estaba 348 m corrido, cerca del Obelisco.
  "teatro coliseo": { lat: -34.5967, lng: -58.3833 },
  "niceto club": { lat: -34.5862, lng: -58.4378 },
  "usina del arte": { lat: -34.6288, lng: -58.3571 },
  "mandarine park": { lat: -34.5652, lng: -58.3987 },
  // Federico Lacroze 3455, Colegiales. Estaba 750 m al norte.
  "teatro vorterix": { lat: -34.5801, lng: -58.451 },
  vorterix: { lat: -34.5801, lng: -58.451 },
  // Se mudó de Palermo a Moreno 364, Monserrat: estaba 5,9 km lejos.
  "bebop club": { lat: -34.6112, lng: -58.3713 },
  "estadio obras": { lat: -34.5455, lng: -58.458 },
  "obras sanitarias": { lat: -34.5455, lng: -58.458 },
  // Corrientes 6271, Chacarita. Estaba 2,4 km al noreste, en pleno Palermo.
  "c art media": { lat: -34.5906, lng: -58.4479 },
  "complejo c art media": { lat: -34.5906, lng: -58.4479 },
  "art media": { lat: -34.5906, lng: -58.4479 },
  "estadio unico": { lat: -34.9138, lng: -57.989 },
  "campo argentino de polo": { lat: -34.5746, lng: -58.4131 },
  "hipodromo de palermo": { lat: -34.5687, lng: -58.4263 },
  "hipodromo argentino de palermo": { lat: -34.5687, lng: -58.4263 },
  "estadio river plate": { lat: -34.5453, lng: -58.4498 },
  monumental: { lat: -34.5453, lng: -58.4498 },
  "la trastienda": { lat: -34.6131, lng: -58.3705 },
  groove: { lat: -34.5794, lng: -58.4231 },
  "parque sarmiento": { lat: -34.5548, lng: -58.4936 },
  // Gutenberg 350, La Paternal.
  "estadio malvinas argentinas": { lat: -34.5925, lng: -58.4718 },
  "microestadio malvinas": { lat: -34.5925, lng: -58.4718 },
  "teatro colon": { lat: -34.6011, lng: -58.3832 },
  // San José 224, Monserrat.
  "centro galicia": { lat: -34.6114, lng: -58.3861 },
  // Adolfo Alsina 940, Monserrat.
  "palacio alsina": { lat: -34.6107, lng: -58.3797 },
  "costa 21": { lat: -34.5444, lng: -58.4383 },
  "teatro flores": { lat: -34.6323, lng: -58.4746 },
  "estadio velez": { lat: -34.6356, lng: -58.5203 },
  velez: { lat: -34.6356, lng: -58.5203 },
  "estadio geba": { lat: -34.5694, lng: -58.4225 },
  geba: { lat: -34.5694, lng: -58.4225 },
  konex: { lat: -34.6049, lng: -58.4113 },
  "la bombonera": { lat: -34.6356, lng: -58.3649 },
  "estadio boca juniors": { lat: -34.6356, lng: -58.3649 },
  "nd teatro": { lat: -34.599, lng: -58.381 },
  "nd ateneo": { lat: -34.599, lng: -58.381 },
  "teatro astral": { lat: -34.6041, lng: -58.3912 },
  "teatro broadway": { lat: -34.6034, lng: -58.3837 },
  "teatro el nacional": { lat: -34.6033, lng: -58.38 },
  tecnopolis: { lat: -34.5545, lng: -58.5088 },
  "estadio huracan": { lat: -34.6432, lng: -58.3976 },
  "estadio argentinos juniors": { lat: -34.6062, lng: -58.4744 },
  "tomas adolfo duco": { lat: -34.6432, lng: -58.3976 },
  "hipodromo de san isidro": { lat: -34.4841, lng: -58.5236 },
  "estadio ferro": { lat: -34.6187, lng: -58.4472 },
  "ferro carril oeste": { lat: -34.6187, lng: -58.4472 },
  "auditorio belgrano": { lat: -34.567, lng: -58.4495 },
  uniclub: { lat: -34.6029, lng: -58.4121 },
  "la tangente": { lat: -34.5876, lng: -58.4325 },
};

// "Teatro Ópera", "Vélez", "Tecnópolis" → sin acentos ni mayúsculas, para que
// el matching no dependa de cómo escribe cada fuente.
export function normalizeVenueName(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

export function findVenueCoords(venue: string | null | undefined): {
  lat: number | null;
  lng: number | null;
} {
  if (!venue) return { lat: null, lng: null };
  const key = normalizeVenueName(venue);
  for (const [name, coords] of Object.entries(VENUE_COORDS)) {
    if (key.includes(name)) return coords;
  }
  return { lat: null, lng: null };
}

export function isKnownVenue(venue: string | null | undefined): boolean {
  return findVenueCoords(venue).lat != null;
}
