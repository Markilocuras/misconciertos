import { ESPERAS_REINTENTO_MS, esEstadoPasajero, INTENTOS_POR_FETCH } from "./ingest-sources";

/**
 * Pide una URL y reintenta lo que puede ser pasajero.
 *
 * Todo fetch a una fuente de la ingesta pasa por acá. El caso que lo justifica
 * es el listado: es lo primero que se pide y de ahí sale el resto, así que un
 * 502 de un segundo volteaba la fuente entera hasta la corrida siguiente —doce
 * horas— y mandaba el mail de aviso. Pasó con tuentrada el 29/09/2026, y cuando
 * se fue a mirar, el sitio contestaba 200 desde las dos redes.
 *
 * Reintentar no es sólo recuperar esa corrida: es lo que hace que el mail
 * vuelva a significar "esta fuente se rompió" en vez de "hubo un hipo", que es
 * lo único que lo hace útil.
 *
 * Qué se reintenta y qué no lo decide `esEstadoPasajero`, que vive junto al
 * presupuesto de subrequests: cada reintento es un subrequest más y ese módulo
 * es el que los cuenta.
 *
 * El error que tira es el del último intento y conserva el formato de siempre
 * (`GET <url> -> <status>`), que es el que termina en el mail de aviso.
 */
export type OpcionesDeReintento = {
  /** El fetch a usar. Se inyecta en los tests; en producción es el global. */
  fetchImpl?: typeof fetch;
  /** La espera entre intentos. Se inyecta en los tests para no dormir de verdad. */
  esperar?: (ms: number) => Promise<void>;
  intentos?: number;
  esperas?: readonly number[];
};

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export async function fetchConReintentos(
  url: string,
  init: RequestInit,
  opciones: OpcionesDeReintento = {},
): Promise<Response> {
  const {
    fetchImpl = fetch,
    esperar = dormir,
    intentos = INTENTOS_POR_FETCH,
    esperas = ESPERAS_REINTENTO_MS,
  } = opciones;

  let ultimoFallo: unknown;

  for (let intento = 1; intento <= intentos; intento++) {
    let pasajero = true;
    try {
      const res = await fetchImpl(url, init);
      if (res.ok) return res;
      ultimoFallo = new Error(`GET ${url} -> ${res.status}`);
      pasajero = esEstadoPasajero(res.status);
    } catch (err) {
      // Que el fetch rechace es DNS, conexión cortada o TLS: para lo que nos
      // importa es lo mismo que un 5xx, y se reintenta igual.
      ultimoFallo = err;
    }

    if (!pasajero || intento === intentos) break;
    // La espera se indexa con el número de intento. Si sobraran o faltaran
    // esperas, el último reintento saldría con un undefined adentro del
    // setTimeout: no falla, espera cero, y el backoff pasa a ser tres golpes
    // seguidos. Hay un test que cuenta que sean una menos que los intentos.
    await esperar(esperas[intento - 1]);
  }

  throw ultimoFallo;
}
