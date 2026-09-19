// Origen canónico de toda URL absoluta que emite la app: meta SEO/OG, JSON-LD,
// sitemap y robots.txt. Sin barra final — cada llamador agrega su propio path.
//
// La app también responde en app.misconciertos.workers.dev (el dominio que
// Cloudflare asigna al Worker). `src/server.ts` redirige ese host acá con un 301
// para que los buscadores vean un solo origen y no contenido duplicado.
export const SITE_URL = "https://misconciertos.com.ar";

// Host del Worker en workers.dev, del que se redirige. Vive acá para que
// server.ts y esta constante no se puedan desincronizar.
export const LEGACY_HOST = "app.misconciertos.workers.dev";

// Perfil oficial de la marca. Lo usan el link del pie y el `sameAs` del
// Organization en el JSON-LD, que es como Google asocia la cuenta al sitio.
export const INSTAGRAM_URL = "https://www.instagram.com/misconciertos.ar/";

// Clave pública VAPID de los avisos por push. Es pública por definición: viaja
// en el bundle del cliente y se la mandamos al push service en cada envío.
//
// Constante y no una env var `VITE_`: Vite las resuelve en build time, así que
// una que falte no rompe el build, sale al aire vacía y el opt-in falla en
// silencio — es la misma trampa que ya nos hizo servir el mapa con la marca de
// agua de Carto. Acá no hay nada que configurar antes de buildear.
//
// Su par privado es el secret `VAPID_PRIVATE_KEY` del Worker. Van juntas: para
// firmar hace falta armar un JWK con las dos, y regenerar una invalida todas
// las suscripciones existentes (los push services contestan 403).
export const VAPID_PUBLIC_KEY =
  "BJY6NIRCEzdcwlHmVfTzWpkkUWjHRVfmDbCMQOZF5sk27byqIl6ik96NFSW1dnnPZaN2oMS_f56ZrTCRsSLeK1g";

// Claim `sub` del JWT de VAPID: a dónde escribe un push service si algo anda
// mal con nuestros envíos. Tiene que ser un mailto: o un https: que exista.
export const VAPID_SUBJECT = "mailto:avisos@misconciertos.com.ar";
