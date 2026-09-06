import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveArtist,
  extractAllAccessEventLinks,
  normalizeDate,
  parseAllEventsListing,
  parseDalePlayLive,
  parseTicketekMusicList,
  slugify,
} from "@/lib/ingest-parsers";

// Los fixtures son la respuesta real de cada fuente, bajada el 06/09/2026 y
// congelada. Eso es lo que los hace útiles: traen el encoding de verdad, las
// cards lazy mezcladas con las inline y las variantes de fecha que ninguna
// documentación menciona.
//
// Lo que estos tests NO hacen es avisar si la fuente cambia su HTML mañana: un
// fixture congelado no se entera de eso nunca. De eso se ocupa el aviso en
// producción, que mira lo que trajo la corrida real. Acá se cubre el otro lado:
// que nadie rompa un parser desde adentro sin que salte.
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

// Fecha de la foto. Fija a propósito: si el "hoy" fuera el real, los tests que
// dependen de inferir el año empezarían a fallar solos con el paso del tiempo.
const NOW = new Date("2026-09-06T12:00:00Z");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("parseAllEventsListing", () => {
  const eventos = parseAllEventsListing(fixture("allevents-concerts.html"), NOW);

  it("saca las 15 cards del listado", () => {
    expect(eventos).toHaveLength(15);
  });

  it("todo evento sale con título, fecha ISO y link de compra", () => {
    for (const ev of eventos) {
      expect(ev.title).toBeTruthy();
      expect(ev.date).toMatch(ISO_DATE);
      expect(ev.buy_url).toMatch(/^https:\/\/allevents\.in\//);
    }
  });

  it("decodifica el título y le saca el artista al nombre de gira", () => {
    const ev = eventos.find((e) => e.title.includes("5 Seconds of Summer"));
    // El bullet y la comilla tipográfica tienen que sobrevivir enteros: si el
    // encoding se rompe, acá aparecen los rombos.
    expect(ev?.title).toBe("5 Seconds of Summer • Everyone’s A Star! World Tour • BA");
    expect(ev?.artist).toBe("5 Seconds of Summer");
  });

  it("pasa la hora de 12 a 24 y trata las 12 AM como medianoche", () => {
    expect(eventos.find((e) => e.artist === "Gustavo Santaolalla")?.time).toBe("20:30");
    expect(eventos.find((e) => e.artist === "HELLOWEEN en MOVISTAR ARENA!")?.time).toBe("19:00");
    // "12:00 AM" es 00:00, no 12:00. Es el caso que más fácil se escribe al revés.
    expect(eventos.find((e) => e.artist === "YEM World Tour")?.time).toBe("00:00");
  });

  it("agarra la imagen tanto de las cards inline como de las lazy", () => {
    // Las cards de abajo del fold dejan la imagen en data-src en vez de en el
    // background inline. Cuando el parser miraba solo el background, ocho de
    // quince entraban sin foto.
    expect(eventos.every((e) => e.image_url?.startsWith("https://"))).toBe(true);
  });

  it("infiere el año cuando la card no lo trae", () => {
    // Una de las quince viene como "Thu, 10 Sep • 07:00 PM + 1 more", sin año.
    const sinAnio = eventos.find((e) => e.title.startsWith("Candlelight"));
    expect(sinAnio?.date).toBe("2026-09-10");

    // Y si el mes ya pasó, es del año que viene: en diciembre, un "10 Sep" es
    // septiembre del año siguiente. Sin esto entraría con fecha pasada y se
    // descartaría entero.
    const enDiciembre = parseAllEventsListing(
      fixture("allevents-concerts.html"),
      new Date("2026-12-01T12:00:00Z"),
    );
    expect(enDiciembre.find((e) => e.title.startsWith("Candlelight"))?.date).toBe("2027-09-10");
  });

  it("no se cuelga ni inventa eventos con html que no es un listado", () => {
    expect(parseAllEventsListing("", NOW)).toEqual([]);
    expect(parseAllEventsListing("<html><body>nada por acá</body></html>", NOW)).toEqual([]);
  });

  // Card mínima con lo único que el parser necesita, para poder probar horarios
  // que la foto del listado no trae. Las quince cards reales van de 3 PM a 9 PM
  // más una medianoche: el mediodía, que es donde la conversión de 12 horas se
  // escribe mal más seguido, no aparece en ninguna.
  function cardCon(fecha: string): string {
    return `<li class="event-card event-card-link" data-link="https://allevents.in/buenos-aires/prueba/1">
      <div class="date">${fecha}</div>
      <h3>Artista de Prueba</h3>
      <div class="location dotdotted">Movistar Arena</div>
    </li>`;
  }

  it("no se pasa de rosca con el mediodía ni la medianoche", () => {
    const hora = (fecha: string) => parseAllEventsListing(cardCon(fecha), NOW)[0]?.time;
    // 12 PM es mediodía y se queda en 12:00; sumarle 12 daría 24:00.
    expect(hora("Thu, 03 Sep, 2026 - 12:00 PM")).toBe("12:00");
    expect(hora("Thu, 03 Sep, 2026 - 12:30 PM")).toBe("12:30");
    // 12 AM es medianoche y baja a 00:00.
    expect(hora("Thu, 03 Sep, 2026 - 12:00 AM")).toBe("00:00");
    // Y el resto de la tarde suma 12 como corresponde.
    expect(hora("Thu, 03 Sep, 2026 - 01:00 PM")).toBe("13:00");
    expect(hora("Thu, 03 Sep, 2026 - 11:00 AM")).toBe("11:00");
  });
});

describe("extractAllAccessEventLinks", () => {
  const links = extractAllAccessEventLinks(fixture("allaccess-home.html"));

  it("saca los links de evento de la home", () => {
    expect(links).toHaveLength(24);
    expect(links).toContain("https://www.allaccess.com.ar/event/lollapalooza-2027");
  });

  it("devuelve siempre urls absolutas de allaccess y sin repetir", () => {
    for (const link of links) {
      expect(link).toMatch(/^https:\/\/www\.allaccess\.com\.ar\/event\//);
    }
    expect(new Set(links).size).toBe(links.length);
  });
});

describe("parseDalePlayLive", () => {
  const eventos = parseDalePlayLive(fixture("daleplay-live.html"));

  it("saca los eventos de las cards", () => {
    expect(eventos).toHaveLength(29);
  });

  it("abre una card en varios eventos cuando el artista tiene varias fechas", () => {
    // Dale Play agrupa por artista y cuelga las funciones adentro de la card:
    // si el parser se queda en el primer nivel, se pierden todas menos una.
    const courtz = eventos.filter((e) => e.artist === "Omar Courtz");
    expect(courtz).toHaveLength(3);
    expect(new Set(courtz.map((e) => e.date)).size).toBe(3);
  });

  it("normaliza las fechas de DD/MM/YYYY a ISO", () => {
    for (const ev of eventos) expect(ev.date).toMatch(ISO_DATE);
    expect(eventos[0].date).toBe("2026-11-08");
  });

  it("separa el venue de la localidad", () => {
    expect(eventos[0].venue).toBe("Teatro Coliseo");
    expect(eventos[0].locality).toContain("CABA");
  });
});

describe("parseTicketekMusicList", () => {
  const items = parseTicketekMusicList(JSON.parse(fixture("ticketek-musica.json")));

  it("saca los artistas del JSON del CMS", () => {
    expect(items).toHaveLength(63);
    expect(items[0]).toMatchObject({ name: "Agus Bernasconi", state: "Capital Federal" });
  });

  it("trae la provincia, que es con lo que después se filtra Buenos Aires", () => {
    expect(items.filter((i) => i.state === "Capital Federal")).toHaveLength(27);
  });

  it("aguanta json que no tiene la forma esperada", () => {
    expect(parseTicketekMusicList(null)).toEqual([]);
    expect(parseTicketekMusicList({})).toEqual([]);
    expect(parseTicketekMusicList({ widgets: "no soy un objeto" })).toEqual([]);
  });
});

describe("helpers", () => {
  it("normalizeDate entiende ISO y el DD/MM/YYYY de Dale Play", () => {
    expect(normalizeDate("2026-09-13")).toBe("2026-09-13");
    expect(normalizeDate("8/11/2026")).toBe("2026-11-08");
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate("no es una fecha")).toBeNull();
  });

  it("deriveArtist corta el título en el separador de gira", () => {
    expect(deriveArtist("Maroon 5 • Love Is Like Tour • BA")).toBe("Maroon 5");
    expect(deriveArtist("Gustavo Santaolalla in Buenos Aires")).toBe("Gustavo Santaolalla");
    expect(deriveArtist("Morat")).toBe("Morat");
  });

  it("slugify saca acentos y colapsa lo que no sea alfanumérico", () => {
    expect(slugify("Teatro Ópera")).toBe("teatro-opera");
    expect(slugify("  Niceto  Club!  ")).toBe("niceto-club");
  });
});
