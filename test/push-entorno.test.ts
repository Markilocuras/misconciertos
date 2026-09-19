import { describe, expect, it } from "vitest";

import {
  appDelWebview,
  contextoPush,
  esIOS,
  ofreceMail,
  type EntornoPush,
} from "@/lib/push-entorno";

// El botón "Avisame de este show" tiene que hacer cosas distintas en cinco
// contextos, y cuatro de ellos son difíciles de tener a mano: un iPhone sin el
// sitio instalado, el mismo iPhone con el sitio instalado, el webview de
// Instagram y un navegador con el permiso ya denegado. Acá entran todos.

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadOS:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  instagramIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.0 (iPhone14,2; iOS 17_5)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36 [FBAN/FB4A;FBAV/450.0.0.0;]",
} as const;

const entorno = (over: Partial<EntornoPush> = {}): EntornoPush => ({
  userAgent: UA.chromeAndroid,
  instalado: false,
  tienePush: true,
  permiso: "default",
  ...over,
});

describe("appDelWebview", () => {
  it("reconoce los webviews que más tráfico nos mandan", () => {
    expect(appDelWebview(UA.instagramIphone)).toBe("Instagram");
    expect(appDelWebview(UA.facebookAndroid)).toBe("Facebook");
  });

  it("no confunde un navegador de verdad con un webview", () => {
    expect(appDelWebview(UA.chromeAndroid)).toBeNull();
    expect(appDelWebview(UA.safariIphone)).toBeNull();
    expect(appDelWebview(UA.chromeDesktop)).toBeNull();
  });
});

describe("esIOS", () => {
  it("reconoce un iPhone", () => {
    expect(esIOS(UA.safariIphone)).toBe(true);
  });

  // Desde iPadOS 13 el iPad dice "Macintosh". Mirando sólo el user agent pasa
  // por desktop y le prometemos un push que Safari no le va a dar nunca.
  it("reconoce un iPad moderno, que se hace pasar por Mac", () => {
    expect(esIOS(UA.ipadOS, 5)).toBe(true);
    expect(esIOS(UA.ipadOS, 0)).toBe(false);
  });

  it("no toma por iOS a un desktop", () => {
    expect(esIOS(UA.chromeDesktop, 0)).toBe(false);
    expect(esIOS(UA.chromeAndroid, 5)).toBe(false);
  });
});

describe("contextoPush", () => {
  it("en Android con permiso sin decidir, se puede pedir", () => {
    expect(contextoPush(entorno())).toEqual({ tipo: "disponible" });
  });

  it("en desktop también", () => {
    expect(contextoPush(entorno({ userAgent: UA.chromeDesktop }))).toEqual({ tipo: "disponible" });
  });

  it("en iOS sin instalar, manda a instalar", () => {
    const ctx = contextoPush(
      entorno({ userAgent: UA.safariIphone, instalado: false, tienePush: false, permiso: null }),
    );
    expect(ctx).toEqual({ tipo: "ios-sin-instalar" });
  });

  it("en iOS ya instalado, se puede pedir el permiso como en cualquier lado", () => {
    const ctx = contextoPush(entorno({ userAgent: UA.safariIphone, instalado: true }));
    expect(ctx).toEqual({ tipo: "disponible" });
  });

  // Adentro de una app la suscripción muere con el webview: anotarse ahí es
  // anotarse a nada.
  it("en el webview de Instagram ofrece el mail, aunque diga tener push", () => {
    const ctx = contextoPush(entorno({ userAgent: UA.instagramIphone, tienePush: true }));
    expect(ctx).toEqual({ tipo: "navegador-in-app", app: "Instagram" });
  });

  // El webview gana sobre iOS: desde Instagram tampoco se puede instalar el
  // sitio, así que el instructivo sería un callejón sin salida.
  it("el webview gana sobre el instructivo de iOS", () => {
    const ctx = contextoPush(
      entorno({ userAgent: UA.instagramIphone, instalado: false, tienePush: false }),
    );
    expect(ctx.tipo).toBe("navegador-in-app");
  });

  it("con el permiso ya denegado no reintenta, ofrece el mail", () => {
    expect(contextoPush(entorno({ permiso: "denied" }))).toEqual({ tipo: "bloqueado" });
  });

  it("sin PushManager queda no soportado", () => {
    const ctx = contextoPush(
      entorno({ userAgent: UA.chromeDesktop, tienePush: false, permiso: null }),
    );
    expect(ctx).toEqual({ tipo: "no-soportado" });
  });

  it("con el permiso ya concedido sigue estando disponible", () => {
    expect(contextoPush(entorno({ permiso: "granted" }))).toEqual({ tipo: "disponible" });
  });
});

describe("ofreceMail", () => {
  it("el mail es la alternativa cuando el push no va a llegar", () => {
    expect(ofreceMail({ tipo: "navegador-in-app", app: "Instagram" })).toBe(true);
    expect(ofreceMail({ tipo: "bloqueado" })).toBe(true);
    expect(ofreceMail({ tipo: "no-soportado" })).toBe(true);
  });

  // En iOS sin instalar no se ofrece el mail: hay un paso concreto que la
  // persona puede dar y que le da la notificación, que es lo que pidió.
  it("no reemplaza al instructivo de iOS ni al pedido de permiso", () => {
    expect(ofreceMail({ tipo: "ios-sin-instalar" })).toBe(false);
    expect(ofreceMail({ tipo: "disponible" })).toBe(false);
  });
});
