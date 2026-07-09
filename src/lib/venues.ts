// Coordenadas conocidas de venues de Buenos Aires y alrededores.
// Compartido entre la ingesta (para geolocalizar eventos scrapeados) y el
// mapa (para saber si un pin corresponde a un escenario conocido).

export const VENUE_COORDS: Record<string, { lat: number; lng: number }> = {
  "movistar arena": { lat: -34.5953, lng: -58.4475 },
  "estadio luna park": { lat: -34.6022, lng: -58.3686 },
  "luna park": { lat: -34.6022, lng: -58.3686 },
  "teatro gran rex": { lat: -34.6033, lng: -58.3814 },
  "gran rex": { lat: -34.6033, lng: -58.3814 },
  "teatro opera": { lat: -34.6034, lng: -58.3823 },
  "teatro coliseo": { lat: -34.5993, lng: -58.3811 },
  "niceto club": { lat: -34.5862, lng: -58.4378 },
  "usina del arte": { lat: -34.6345, lng: -58.3597 },
  "mandarine park": { lat: -34.5453, lng: -58.4361 },
  "teatro vorterix": { lat: -34.5733, lng: -58.4503 },
  "vorterix": { lat: -34.5733, lng: -58.4503 },
  "bebop club": { lat: -34.5889, lng: -58.4298 },
  "estadio obras": { lat: -34.5456, lng: -58.4495 },
  "obras sanitarias": { lat: -34.5456, lng: -58.4495 },
  "c art media": { lat: -34.5697, lng: -58.4416 },
  "complejo c art media": { lat: -34.5697, lng: -58.4416 },
  "art media": { lat: -34.5697, lng: -58.4416 },
  "estadio unico": { lat: -34.9215, lng: -57.9919 },
  "campo argentino de polo": { lat: -34.5746, lng: -58.4131 },
  "hipodromo de palermo": { lat: -34.5687, lng: -58.4263 },
  "hipodromo argentino de palermo": { lat: -34.5687, lng: -58.4263 },
  "estadio river plate": { lat: -34.5453, lng: -58.4498 },
  "monumental": { lat: -34.5453, lng: -58.4498 },
  "la trastienda": { lat: -34.6189, lng: -58.3705 },
  "groove": { lat: -34.5867, lng: -58.4259 },
  "parque sarmiento": { lat: -34.5548, lng: -58.4936 },
  "estadio malvinas argentinas": { lat: -34.6026, lng: -58.4592 },
  "microestadio malvinas": { lat: -34.6026, lng: -58.4592 },
  "teatro colon": { lat: -34.6011, lng: -58.3832 },
  "centro galicia": { lat: -34.6095, lng: -58.4128 },
  "palacio alsina": { lat: -34.6101, lng: -58.3737 },
  "costa 21": { lat: -34.5444, lng: -58.4383 },
  "teatro flores": { lat: -34.6284, lng: -58.4635 },
  "estadio velez": { lat: -34.6356, lng: -58.5203 },
  "velez": { lat: -34.6356, lng: -58.5203 },
  "estadio geba": { lat: -34.5694, lng: -58.4225 },
  "geba": { lat: -34.5694, lng: -58.4225 },
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
  "tomas adolfo duco": { lat: -34.6432, lng: -58.3976 },
  "hipodromo de san isidro": { lat: -34.4841, lng: -58.5236 },
  "estadio ferro": { lat: -34.6187, lng: -58.4472 },
  "ferro carril oeste": { lat: -34.6187, lng: -58.4472 },
  "auditorio belgrano": { lat: -34.5637, lng: -58.4527 },
  "uniclub": { lat: -34.6053, lng: -58.4133 },
  "la tangente": { lat: -34.5876, lng: -58.4325 },
};

// "Teatro Ópera", "Vélez", "Tecnópolis" → sin acentos ni mayúsculas, para que
// el matching no dependa de cómo escribe cada fuente.
export function normalizeVenueName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
