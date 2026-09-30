import { describe, expect, it } from "vitest";

import { fetchConReintentos } from "@/lib/fetch-con-reintentos";

// Este helper corre dos veces por día, sin nadie mirando, y todo lo que puede
// hacer mal lo hace en silencio: no reintentar, reintentar un 404, perderse el
// error original, esperar cero entre golpes. Nada de eso tira una excepción ni
// se ve en la corrida siguiente, así que va con test.
//
// Las esperas y el fetch se inyectan: los tests no duermen de verdad ni tocan
// la red.

type Respuesta = { status: number } | { error: string };

/** Un fetch de mentira que devuelve una respuesta distinta por intento. */
function fetchFalso(respuestas: Respuesta[]) {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(String(url));
    const r = respuestas[urls.length - 1] ?? respuestas[respuestas.length - 1];
    if ("error" in r) throw new Error(r.error);
    return { ok: r.status >= 200 && r.status < 300, status: r.status } as Response;
  }) as unknown as typeof fetch;
  return { impl, llamadas: () => urls.length };
}

const sinDormir = async () => {};

describe("fetchConReintentos", () => {
  it("no reintenta lo que salió bien", async () => {
    const f = fetchFalso([{ status: 200 }]);
    const res = await fetchConReintentos("https://x.test/", {}, { fetchImpl: f.impl });
    expect(res.status).toBe(200);
    expect(f.llamadas()).toBe(1);
  });

  // El caso que motivó todo: tuentrada contestó 502 una vez y volvió sola.
  it("se recupera de un 502 pasajero", async () => {
    const f = fetchFalso([{ status: 502 }, { status: 200 }]);
    const res = await fetchConReintentos(
      "https://www.tuentrada.com/",
      {},
      { fetchImpl: f.impl, esperar: sinDormir },
    );
    expect(res.status).toBe(200);
    expect(f.llamadas()).toBe(2);
  });

  it("se rinde después de los intentos y tira el último error", async () => {
    const f = fetchFalso([{ status: 502 }]);
    await expect(
      fetchConReintentos("https://x.test/", {}, { fetchImpl: f.impl, esperar: sinDormir }),
    ).rejects.toThrow("GET https://x.test/ -> 502");
    expect(f.llamadas()).toBe(3);
  });

  // Insistir sobre un 404 gasta dos subrequests y dos esperas para llegar a la
  // misma respuesta. El presupuesto de la ingesta se cuenta en subrequests.
  it("no reintenta un 404", async () => {
    const f = fetchFalso([{ status: 404 }]);
    await expect(
      fetchConReintentos("https://x.test/", {}, { fetchImpl: f.impl, esperar: sinDormir }),
    ).rejects.toThrow("-> 404");
    expect(f.llamadas()).toBe(1);
  });

  it("no reintenta un 403: si una fuente nos bloquea hay que enterarse", async () => {
    const f = fetchFalso([{ status: 403 }]);
    await expect(
      fetchConReintentos("https://x.test/", {}, { fetchImpl: f.impl, esperar: sinDormir }),
    ).rejects.toThrow("-> 403");
    expect(f.llamadas()).toBe(1);
  });

  // Un fetch que rechaza es DNS, conexión cortada o TLS. Antes de esto era
  // indistinguible de una fuente rota, y volteaba la corrida igual.
  it("reintenta un error de red y conserva el error si no se recupera", async () => {
    const f = fetchFalso([{ error: "network error" }]);
    await expect(
      fetchConReintentos("https://x.test/", {}, { fetchImpl: f.impl, esperar: sinDormir }),
    ).rejects.toThrow("network error");
    expect(f.llamadas()).toBe(3);
  });

  it("un error de red que se recupera devuelve la respuesta buena", async () => {
    const f = fetchFalso([{ error: "network error" }, { status: 200 }]);
    const res = await fetchConReintentos(
      "https://x.test/",
      {},
      { fetchImpl: f.impl, esperar: sinDormir },
    );
    expect(res.status).toBe(200);
  });

  // Las esperas crecen, y la que se usa es la del intento que acaba de fallar.
  // Si se indexaran mal, el backoff serían tres golpes seguidos.
  it("espera entre intentos, en orden y una vez menos que los intentos", async () => {
    const f = fetchFalso([{ status: 503 }]);
    const esperado: number[] = [];
    await expect(
      fetchConReintentos(
        "https://x.test/",
        {},
        {
          fetchImpl: f.impl,
          esperar: async (ms) => {
            esperado.push(ms);
          },
          intentos: 4,
          esperas: [10, 20, 30],
        },
      ),
    ).rejects.toThrow();
    expect(f.llamadas()).toBe(4);
    expect(esperado).toEqual([10, 20, 30]);
  });

  it("no espera después del último intento", async () => {
    const f = fetchFalso([{ status: 500 }]);
    let esperas = 0;
    await expect(
      fetchConReintentos(
        "https://x.test/",
        {},
        {
          fetchImpl: f.impl,
          esperar: async () => {
            esperas++;
          },
          intentos: 2,
          esperas: [10],
        },
      ),
    ).rejects.toThrow();
    expect(esperas).toBe(1);
  });
});
