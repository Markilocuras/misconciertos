import { afterEach, describe, expect, it, vi } from "vitest";
import { sendArtistAlerts, type AlertaDeArtista } from "@/lib/email.server";

// La ficha de cada artista promete "te vamos a avisar cuando {artista} anuncie
// un show nuevo". Durante meses no lo cumplió nadie: la gente se anotaba y esa
// tabla no la leía ni una línea de código. Esto es lo que lo cumple, así que
// vale testear que salga bien y que un problema con Resend no explote hacia
// arriba: se llama después de escribir los conciertos.

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

const concierto = (artist: string, slug: string) => ({
  title: artist,
  artist,
  venue: "Teatro Gran Rex",
  date: "2026-11-07",
  time: "21:00",
  slug,
});

const UNA: AlertaDeArtista[] = [
  {
    email: "yo@ejemplo.com",
    unsubscribe_token: "11111111-1111-1111-1111-111111111111",
    conciertos: [{ artista: "Jairo", concierto: concierto("Jairo", "jairo-gran-rex") }],
  },
];

const cuerpo = (fetchMock: ReturnType<typeof mockFetch>) =>
  JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

describe("sendArtistAlerts", () => {
  it("manda un mail con el artista en el asunto", async () => {
    const fetchMock = mockFetch({});
    expect(await sendArtistAlerts("re_test", UNA)).toEqual({ sent: 1, failed: 0 });

    const [mail] = cuerpo(fetchMock);
    expect(mail.to).toEqual(["yo@ejemplo.com"]);
    expect(mail.subject).toBe("Jairo anunció un show");
    expect(mail.text).toContain("jairo-gran-rex");
    expect(mail.text).toContain("Teatro Gran Rex");
  });

  // Lo que evita que alguien anotado en tres artistas reciba tres mails el
  // mismo día. El agrupado lo hace quien llama, pero el asunto tiene que
  // acompañar o el mail miente.
  it("con varios artistas el asunto no nombra uno solo", async () => {
    const fetchMock = mockFetch({});
    await sendArtistAlerts("re_test", [
      {
        email: "yo@ejemplo.com",
        unsubscribe_token: "11111111-1111-1111-1111-111111111111",
        conciertos: [
          { artista: "Jairo", concierto: concierto("Jairo", "a") },
          { artista: "Bandalos Chinos", concierto: concierto("Bandalos Chinos", "b") },
        ],
      },
    ]);
    const [mail] = cuerpo(fetchMock);
    expect(mail.subject).toBe("2 artistas que seguís anunciaron shows");
    // Y cada línea dice por cuál se anotó, que es lo que hace entendible
    // recibir un mail por un artista que no recordás haber seguido.
    expect(mail.text).toContain("te anotaste por Jairo");
    expect(mail.text).toContain("te anotaste por Bandalos Chinos");
  });

  // La baja es por suscripción, no por persona: quien sigue a tres artistas y
  // se cansa de uno no tiene que perder los otros. Y el `tipo=artista` importa,
  // porque sin eso /baja le daría de baja del resumen, que es otra cosa.
  it("el link de baja apunta al aviso de artista y lleva el token", async () => {
    const fetchMock = mockFetch({});
    await sendArtistAlerts("re_test", UNA);
    const [mail] = cuerpo(fetchMock);

    const esperado = "/baja?tipo=artista&token=11111111-1111-1111-1111-111111111111";
    expect(mail.text).toContain(esperado);
    // En el HTML el & va escapado, que es lo correcto dentro de un href.
    expect(mail.html).toContain(esperado.replace("&", "&amp;"));
    // Gmail y Outlook muestran su propio botón con esto.
    expect(mail.headers["List-Unsubscribe"]).toContain(esperado);
  });

  it("no manda nada si no hay a quién avisarle", async () => {
    const fetchMock = mockFetch({});
    expect(await sendArtistAlerts("re_test", [])).toEqual({ sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devuelve el error en vez de tirar cuando Resend rechaza", async () => {
    mockFetch({ ok: false, status: 422, text: async () => "no" });
    const res = await sendArtistAlerts("re_test", UNA);
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.error).toContain("422");
  });

  it("devuelve el error en vez de tirar cuando la red falla", async () => {
    mockFetch(new Error("ECONNRESET"));
    const res = await sendArtistAlerts("re_test", UNA);
    expect(res).toMatchObject({ sent: 0, failed: 1, error: "ECONNRESET" });
  });

  // Los datos vienen de scraping y el nombre del artista lo escribe quien se
  // anota: todo escapado antes de entrar al HTML.
  it("escapa el html", async () => {
    const fetchMock = mockFetch({});
    await sendArtistAlerts("re_test", [
      {
        email: "yo@ejemplo.com",
        unsubscribe_token: "11111111-1111-1111-1111-111111111111",
        conciertos: [
          { artista: "<script>x</script>", concierto: concierto("<script>x</script>", "s") },
        ],
      },
    ]);
    const [mail] = cuerpo(fetchMock);
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
