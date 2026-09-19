// En qué contexto está el navegador que abrió la ficha, y por lo tanto qué
// puede ofrecerle el botón "Avisame de este show".
//
// Funciones puras con todo inyectado: el user agent, si está instalado, si hay
// PushManager y cuál es el permiso. Así se testea cada caso sin un navegador
// —que es la única forma de cubrir el webview de Instagram en un iPhone sin
// tener un iPhone con Instagram— y el componente queda con una sola decisión.

export type ContextoPush =
  /** Se puede pedir el permiso nativo. */
  | { tipo: "disponible" }
  /** iOS sin instalar como PWA: hay que explicar cómo agregarlo. */
  | { tipo: "ios-sin-instalar" }
  /** Webview de una app (Instagram, Facebook…): va directo al mail. */
  | { tipo: "navegador-in-app"; app: string }
  /** El permiso ya fue denegado; el navegador no lo vuelve a preguntar. */
  | { tipo: "bloqueado" }
  /** Sin soporte de push en absoluto. */
  | { tipo: "no-soportado" };

export type EntornoPush = {
  userAgent: string;
  /** `display-mode: standalone` o `navigator.standalone` en iOS. */
  instalado: boolean;
  /** Hay serviceWorker + PushManager + Notification. */
  tienePush: boolean;
  /** `Notification.permission`, o null si la API no existe. */
  permiso: NotificationPermission | null;
};

// Los webviews se identifican por un token en el user agent. Facebook usa tres
// distintos según la app y la plataforma, por eso están los tres.
const APPS_CON_WEBVIEW: Array<{ patron: RegExp; nombre: string }> = [
  { patron: /Instagram/i, nombre: "Instagram" },
  { patron: /FBAN|FBAV|FB_IAB/i, nombre: "Facebook" },
  { patron: /TikTok|musical_ly/i, nombre: "TikTok" },
  { patron: /Twitter/i, nombre: "X" },
  { patron: /LinkedInApp/i, nombre: "LinkedIn" },
  { patron: /Snapchat/i, nombre: "Snapchat" },
  { patron: /\bLine\//i, nombre: "Line" },
];

/** Qué app abrió este webview, o null si es un navegador de verdad. */
export function appDelWebview(userAgent: string): string | null {
  for (const { patron, nombre } of APPS_CON_WEBVIEW) {
    if (patron.test(userAgent)) return nombre;
  }
  return null;
}

/**
 * iPhone, iPad o iPod.
 *
 * `maxTouchPoints` no es un capricho: desde iPadOS 13 un iPad se identifica
 * como "Macintosh" en el user agent, así que mirar sólo el UA lo trata como
 * desktop y le promete un push que Safari no le va a dar.
 */
export function esIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * La decisión del botón, en un solo lugar.
 *
 * El orden de los chequeos importa. El webview va primero incluso cuando
 * `PushManager` existe: adentro de una app la suscripción queda atada a un
 * almacenamiento efímero que muere con el webview, así que el usuario se
 * anotaría y no recibiría nada —y encima el navegador de verdad, donde sí
 * funcionaría, no se enteraría de nada—. Y va antes que iOS porque desde el
 * webview de Instagram tampoco se puede instalar el sitio: mostrar ahí el
 * instructivo de "agregá a pantalla de inicio" sería mandar a un callejón.
 */
export function contextoPush(entorno: EntornoPush): ContextoPush {
  const { userAgent, instalado, tienePush, permiso } = entorno;

  const app = appDelWebview(userAgent);
  if (app) return { tipo: "navegador-in-app", app };

  // En iOS el push existe sólo si el sitio está en la pantalla de inicio. Se
  // chequea antes que `tienePush` a propósito: Safari sin instalar directamente
  // no expone PushManager, y "no soportado" sería cierto pero inútil —hay algo
  // que la persona puede hacer al respecto—.
  if (esIOS(userAgent) && !instalado) return { tipo: "ios-sin-instalar" };

  if (!tienePush) return { tipo: "no-soportado" };
  if (permiso === "denied") return { tipo: "bloqueado" };

  return { tipo: "disponible" };
}

/** Si en este contexto corresponde ofrecer el mail en vez de la notificación. */
export function ofreceMail(contexto: ContextoPush): boolean {
  return (
    contexto.tipo === "navegador-in-app" ||
    contexto.tipo === "bloqueado" ||
    contexto.tipo === "no-soportado"
  );
}

/**
 * La VAPID pública en el formato que pide `pushManager.subscribe`, que quiere
 * bytes y no el base64url en el que la guardamos.
 */
export function claveDeAplicacion(publicKeyB64url: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKeyB64url.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binario = atob(relleno);
  const out = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) out[i] = binario.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Qué sigue este navegador
//
// Es sólo para pintar el estado al volver a la página: la tabla no la puede
// leer anon, y el dato no es crítico —si se pierde, el botón vuelve a aparecer
// y tocarlo reescribe la misma fila—. Por eso localStorage y no una consulta.
//
// Nunca se lee en render, sólo dentro de efectos y handlers: leerlo en render
// rompe la hidratación, porque el HTML del server no puede saber qué hay acá.
// ---------------------------------------------------------------------------

export function seguidos(clave: string): string[] {
  try {
    const crudo = localStorage.getItem(clave);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function recordarSeguido(clave: string, id: string, seguido: boolean) {
  try {
    const lista = seguidos(clave).filter((x) => x !== id);
    if (seguido) lista.push(id);
    localStorage.setItem(clave, JSON.stringify(lista));
  } catch {
    // Modo privado o storage bloqueado: el alta ya quedó guardada en el
    // servidor, que es lo que importa.
  }
}

/** Lee el entorno real del navegador. Sólo se puede llamar en el cliente. */
export function leerEntorno(): EntornoPush {
  const tieneNotification = typeof Notification !== "undefined";
  return {
    userAgent: navigator.userAgent,
    instalado:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    tienePush: "serviceWorker" in navigator && "PushManager" in window && tieneNotification,
    permiso: tieneNotification ? Notification.permission : null,
  };
}
