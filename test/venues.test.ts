import { describe, expect, it } from "vitest";
import {
  VENUE_COORDS,
  estaEnBuenosAires,
  findVenueCoords,
  isKnownVenue,
  normalizeVenueName,
} from "@/lib/venues";

// Un venue sin coordenadas se descarta en la ingesta, así que cada fallo de
// matching acá es un recital que no llega al mapa. En agosto de 2026 eso estaba
// tirando entre el 22% y el 35% de lo scrapeado.

describe("normalizeVenueName", () => {
  it("saca acentos, mayúsculas y espacios de más", () => {
    expect(normalizeVenueName("Teatro Ópera")).toBe("teatro opera");
    expect(normalizeVenueName("  MOVISTAR   ARENA  ")).toBe("movistar arena");
  });
});

describe("findVenueCoords", () => {
  it("matchea el nombre tal cual lo escribe cada fuente", () => {
    // Ticketek dice "Teatro Opera On", Dale Play "Movistar Arena": el match es
    // por substring justamente para aguantar los sufijos de cada uno.
    expect(isKnownVenue("Teatro Opera On")).toBe(true);
    expect(isKnownVenue("Movistar Arena Argentina")).toBe(true);
    expect(isKnownVenue("Teatro Colón")).toBe(true);
  });

  it("aguanta las palabras de relleno que cambian entre fuentes", () => {
    // Estos dos venues estaban cargados hace rato pero el match fallaba por una
    // sola palabra, y se perdían shows en silencio: la tabla decía "auditorio
    // belgrano" y Ticketek escribe "Auditorio de Belgrano"; decía "campo
    // argentino de polo" y Dale Play escribe "Campo de Polo".
    expect(isKnownVenue("Auditorio de Belgrano")).toBe(true);
    expect(isKnownVenue("Campo de Polo")).toBe(true);

    // Y las dos formas tienen que caer en el mismo punto del mapa.
    expect(findVenueCoords("Auditorio de Belgrano")).toEqual(findVenueCoords("Auditorio Belgrano"));
    expect(findVenueCoords("Campo de Polo")).toEqual(findVenueCoords("Campo Argentino de Polo"));
  });

  it("conoce los venues que se agregaron después de la auditoría", () => {
    for (const venue of [
      "Teatro Devoto",
      "Parque de la Ciudad",
      "Parque Roca",
      "Universidad Nacional de La Matanza",
    ]) {
      expect(isKnownVenue(venue), venue).toBe(true);
    }
  });

  it("devuelve null cuando no lo conoce, en vez de inventar una coordenada", () => {
    // Que devuelva null es lo correcto: la fila se descarta y el venue aparece
    // en unknownVenues para cargarlo a mano. Inventar la coordenada pondría un
    // pin en el lugar equivocado, que es peor.
    expect(findVenueCoords("A&R Music Bar")).toEqual({ lat: null, lng: null });
    expect(findVenueCoords(null)).toEqual({ lat: null, lng: null });
    expect(findVenueCoords("")).toEqual({ lat: null, lng: null });
  });

  it("deja las coordenadas dentro del área metropolitana", () => {
    // Red de seguridad contra un error de tipeo o un signo dado vuelta: todo lo
    // que esté en la tabla tiene que caer razonablemente cerca de Buenos Aires.
    for (const venue of ["Movistar Arena", "Teatro Devoto", "Parque Roca", "Luna Park"]) {
      const { lat, lng } = findVenueCoords(venue);
      expect(lat, venue).toBeGreaterThan(-35.5);
      expect(lat, venue).toBeLessThan(-34);
      expect(lng, venue).toBeGreaterThan(-59);
      expect(lng, venue).toBeLessThan(-57.5);
    }
  });

  it("conoce los venues del interior que se agregaron el 09/09", () => {
    // Salían en unknownVenues corrida tras corrida: eran shows reales que se
    // caían por no tener coordenada.
    for (const venue of [
      "Hipodromo de La Plata",
      "Club Atenas",
      "City Rock",
      "Teatro San Carlos",
      "DOW Center",
      // All Access lo escribe a secas y no matcheaba con ninguna de las dos
      // claves largas que ya estaban en la tabla.
      "Malvinas Argentinas",
    ]) {
      expect(isKnownVenue(venue), venue).toBe(true);
    }
  });

  it("no deja que un nombre corto se coma a otro venue", () => {
    // Club Estudiantes de Bahía Blanca quedó deliberadamente fuera de la tabla:
    // Dale Play lo manda como "Club Estudiantes" a secas y una clave así le
    // pondría también el pin a Estudiantes de La Plata, a 270 km. Si alguien lo
    // agrega sin resolver la ambigüedad, esto avisa.
    expect(isKnownVenue("Club Estudiantes")).toBe(false);
  });

  // La de arriba mira cuatro venues elegidos a mano; esta mira la tabla entera,
  // que es donde un dedo torcido pasa desapercibido. El mapa cubre toda la
  // provincia de Buenos Aires, así que la caja es la provincia: de Bahía Blanca
  // al sur hasta el norte bonaerense, y de Junín al este hasta la costa.
  it("ninguna coordenada de la tabla se va de la provincia", () => {
    for (const [nombre, { lat, lng }] of Object.entries(VENUE_COORDS)) {
      expect(lat, nombre).toBeGreaterThan(-41.1);
      expect(lat, nombre).toBeLessThan(-33.2);
      expect(lng, nombre).toBeGreaterThan(-63.4);
      expect(lng, nombre).toBeLessThan(-56.6);
    }
  });
});

// Última red antes del mapa: la coordenada que publica una fuente no siempre es
// de acá. Tu Entrada trae la del Anfiteatro Municipal de Rosario —real, bien
// puesta, y en Santa Fe— y el filtro por ciudad no la agarra porque esa ficha
// no dice de qué ciudad es.
describe("estaEnBuenosAires", () => {
  it("acepta la provincia entera, no solo el conurbano", () => {
    expect(estaEnBuenosAires(-34.6037, -58.3816)).toBe(true); // Obelisco
    expect(estaEnBuenosAires(-34.9213, -57.9545)).toBe(true); // La Plata
    expect(estaEnBuenosAires(-37.3217, -59.1332)).toBe(true); // Tandil
    expect(estaEnBuenosAires(-38.7183, -62.2661)).toBe(true); // Bahía Blanca
    expect(estaEnBuenosAires(-34.5836, -60.9433)).toBe(true); // Junín
    expect(estaEnBuenosAires(-38.0055, -57.5426)).toBe(true); // Mar del Plata
  });

  it("rechaza lo de otras provincias", () => {
    expect(estaEnBuenosAires(-32.9468, -60.6393)).toBe(false); // Rosario
    expect(estaEnBuenosAires(-31.4201, -64.1888)).toBe(false); // Córdoba
    expect(estaEnBuenosAires(-32.8895, -68.8458)).toBe(false); // Mendoza
    expect(estaEnBuenosAires(-26.8083, -65.2176)).toBe(false); // Tucumán
    expect(estaEnBuenosAires(-38.9516, -68.0591)).toBe(false); // Neuquén
  });

  it("sin coordenada devuelve false, no se la juega", () => {
    expect(estaEnBuenosAires(null, null)).toBe(false);
    expect(estaEnBuenosAires(-34.6, null)).toBe(false);
  });

  it("toda la tabla cae adentro", () => {
    for (const [nombre, { lat, lng }] of Object.entries(VENUE_COORDS)) {
      expect(estaEnBuenosAires(lat, lng), nombre).toBe(true);
    }
  });
});
