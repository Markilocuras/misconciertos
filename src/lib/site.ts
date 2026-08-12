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
