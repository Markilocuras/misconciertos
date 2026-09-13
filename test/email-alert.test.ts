import { afterEach, describe, expect, it, vi } from "vitest";
import { sendIngestAlert, type FuenteCaida } from "@/lib/email.server";

// El aviso es lo único que separa "una fuente se rompió" de "nos enteramos dos
// meses después mirando por qué el mapa se sentía viejo". Vale testear que
// realmente sale, y que un problema mandándolo no explota hacia arriba: se
// llama al final de la ingesta, después de guardar, y no puede voltear una
// corrida que ya escribió los conciertos.

const CAIDA: FuenteCaida[] = [{ source: "ticketek", found: 0 }];

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(respuesta: Partial<Response> | Error) {
  const fn = vi.fn(async () => {
    if (respuesta instanceof Error) throw respuesta;
    return { ok: true, status: 200, text: async () => "", ...respuesta } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("sendIngestAlert", () => {
  it("manda el mail y nombra la fuente en el asunto", async () => {
    const fetchMock = mockFetch({});
    const res = await sendIngestAlert("re_test", "yo@ejemplo.com", CAIDA);

    expect(res).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["yo@ejemplo.com"]);
    expect(body.subject).toContain("ticketek");
    // El mail tiene que decir qué hacer, no solo que algo se rompió.
    expect(body.text).toContain("debug=1");
    expect(body.html).toContain("ticketek");
  });

  it("lista todas las fuentes cuando se cae más de una", async () => {
    const fetchMock = mockFetch({});
    await sendIngestAlert("re_test", "yo@ejemplo.com", [
      { source: "ticketek", found: 0 },
      { source: "livepass", found: 0, error: "GET ... -> 503" },
    ]);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.subject).toContain("ticketek");
    expect(body.subject).toContain("livepass");
    // La que falló con error tiene que mostrar el error, no el mensaje genérico.
    expect(body.text).toContain("503");
  });

  // El aviso mandaba siempre al mismo lado: "cambió el HTML, corré ?debug=1".
  // Para una fuente que cortó con error ese consejo es el peor posible, porque
  // debug saltea la escritura en la base a propósito: si la corrida se cayó
  // ahí, debug vuelve verde y uno concluye que no pasaba nada.
  describe("el consejo según cómo falló", () => {
    const cuerpo = (fetchMock: ReturnType<typeof mockFetch>) =>
      JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

    it("a la que vino vacía la manda a debug", async () => {
      const fetchMock = mockFetch({});
      await sendIngestAlert("re_test", "yo@ejemplo.com", [{ source: "ticketek", found: 0 }]);
      const body = cuerpo(fetchMock);
      expect(body.subject).toContain("sin datos");
      expect(body.text).toContain("debug=1");
      expect(body.text).not.toContain("wrangler tail");
    });

    it("a la que cortó con error la manda a los logs, y la previene sobre debug", async () => {
      const fetchMock = mockFetch({});
      await sendIngestAlert("re_test", "yo@ejemplo.com", [
        { source: "allaccess", found: 25, error: "duplicate key — code 23505" },
      ]);
      const body = cuerpo(fetchMock);
      expect(body.subject).toContain("falló");
      expect(body.text).toContain("wrangler tail");
      expect(body.html).toContain("wrangler tail");
      // No la manda a debug como si fuera el camino, la avisa de lo contrario.
      expect(body.text).toContain("va a volver verde");
    });

    it("con las dos clases juntas da los dos consejos", async () => {
      const fetchMock = mockFetch({});
      await sendIngestAlert("re_test", "yo@ejemplo.com", [
        { source: "ticketek", found: 0 },
        { source: "allaccess", found: 25, error: "boom" },
      ]);
      const body = cuerpo(fetchMock);
      expect(body.text).toContain("debug=1");
      expect(body.text).toContain("wrangler tail");
    });
  });

  it("no manda nada si no hay ninguna fuente caída", async () => {
    const fetchMock = mockFetch({});
    expect(await sendIngestAlert("re_test", "yo@ejemplo.com", [])).toEqual({ sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devuelve el error en vez de tirar cuando Resend rechaza", async () => {
    mockFetch({ ok: false, status: 422, text: async () => "dominio no verificado" });
    const res = await sendIngestAlert("re_test", "yo@ejemplo.com", CAIDA);
    expect(res.sent).toBe(false);
    expect(res.error).toContain("422");
  });

  it("devuelve el error en vez de tirar cuando la red falla", async () => {
    mockFetch(new Error("network down"));
    const res = await sendIngestAlert("re_test", "yo@ejemplo.com", CAIDA);
    expect(res).toEqual({ sent: false, error: "network down" });
  });
});
