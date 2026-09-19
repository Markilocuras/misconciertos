// Service worker de misconciertos.
//
// Sólo notificaciones: no cachea nada ni intercepta fetch. El sitio se sirve
// entero desde el Worker de Cloudflare y meter una capa de caché acá sería
// agregar un lugar más donde el mapa puede quedar viejo.
//
// Es JS a mano y no pasa por Vite a propósito: vive en public/, se sirve tal
// cual desde la raíz —que es lo que le da alcance sobre todo el sitio— y no
// tiene imports que bundlear.

// Lo que manda push.server.ts. Si algo llega sin payload o con un payload que
// no es JSON, igual hay que mostrar algo: el navegador exige una notificación
// visible por cada push recibido, y si no la mostramos, muestra él una que dice
// "este sitio se actualizó en segundo plano".
function leerPayload(event) {
  const fallback = {
    title: "Novedades en misconciertos",
    body: "Hay shows nuevos en el mapa.",
    url: "https://misconciertos.com.ar/",
    tag: "misconciertos-artista",
  };

  if (!event.data) return fallback;
  try {
    const datos = event.data.json();
    return {
      title: datos.title || fallback.title,
      body: datos.body || fallback.body,
      url: datos.url || fallback.url,
      tag: datos.tag || fallback.tag,
    };
  } catch (err) {
    console.error("[sw] payload ilegible", err);
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  const datos = leerPayload(event);

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Con tag fijo, un aviso nuevo reemplaza al anterior en vez de apilarse.
      tag: datos.tag,
      // El clic necesita saber a dónde ir, y el handler de abajo no recibe el
      // payload: sólo la notificación.
      data: { url: datos.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/";

  // Si el sitio ya está abierto en una pestaña, se reusa: abrir una segunda
  // pestaña de misconciertos cuando hay una es molesto y pierde el estado del
  // mapa.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if (ventana.url === destino && "focus" in ventana) return ventana.focus();
      }
      for (const ventana of ventanas) {
        if ("navigate" in ventana && "focus" in ventana) {
          return ventana.navigate(destino).then((v) => (v ? v.focus() : null));
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});

// El navegador puede rotar una suscripción por su cuenta. Cuando pasa, el
// endpoint viejo empieza a contestar 410 y la limpieza lo borra — o sea que la
// persona deja de recibir avisos sin haberse dado de baja nunca.
//
// El service worker no sabe a qué artistas seguía ese endpoint: eso lo sabe la
// base. Por eso manda los dos endpoints y el servidor mueve las filas.
self.addEventListener("pushsubscriptionchange", (event) => {
  const vieja = event.oldSubscription;
  const nueva = event.newSubscription;
  if (!vieja || !nueva) return;

  const claves = nueva.toJSON().keys || {};
  event.waitUntil(
    fetch("/api/public/hooks/subscribe-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "migrar",
        endpointViejo: vieja.endpoint,
        endpoint: nueva.endpoint,
        p256dh: claves.p256dh,
        auth: claves.auth,
      }),
    }).catch((err) => console.error("[sw] no se pudo migrar la suscripción", err)),
  );
});
