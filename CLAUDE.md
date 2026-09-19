# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

misconciertos — an interactive map of upcoming concerts/recitals in Buenos Aires (React + TanStack Start). Originally scaffolded by Lovable Cloud, but since decoupled from it (PR #4, `chore/decouple-lovable-build-and-db`): the build, the Vite config and the Supabase project are all owned by this repo now. See `public/llms.txt` for the one-page product description.

## Commands

Package manager is **bun** (`bun.lock`, `bunfig.toml`) — use `bun`, not `npm`/`yarn`/`pnpm`.

- `bun install` — install deps
- `bun run dev` — start dev server (`vite dev`)
- `bun run build` — production build (`vite build`)
- `bun run build:dev` — development-mode build
- `bun run preview` — preview a production build
- `bun run test` — Vitest, una pasada (`vitest run`); `bun run test:watch` para el modo watch
- `bun run lint` — ESLint (flat config, `eslint.config.js`)
- `bun run format` — Prettier write (`.prettierrc`: 100 width, double quotes off i.e. `"`, trailing commas)

**Tests**: Vitest, en `test/`, con su propia `vitest.config.ts` (mínima a propósito: `vite.config.ts` arma toda la app con nitro y el plugin de TanStack, y nada de eso hace falta para funciones puras). Cubren los parsers de la ingesta, el matching de `VENUE_COORDS`, el cálculo de "hoy" en hora argentina y el encriptado de Web Push.

**No hay ninguna dependencia de web-push en este proyecto, y no hace falta agregarla.** `web-push` de npm efectivamente no corre en Workers —usa `https` y APIs de `node:crypto` que `nodejs_compat` no cubre—, pero la alternativa no fue buscar otra librería: está implementado a mano en `src/lib/web-push.server.ts` contra `crypto.subtle` y `fetch`, que son nativos del runtime. Traer `@block65/webcrypto-web-push` u otra a esta altura cambiaría algo verificado contra los vectores del RFC por algo sin verificar, sumaría superficie de supply-chain y chocaría con el guard de `minimumReleaseAge`.

Ese último (`test/web-push.test.ts`) es el que justifica haber escrito el push a mano con WebCrypto en vez de traer `web-push` de npm: el RFC 8291 publica su ejemplo entero —claves, salt y salida, todo fijo— así que el encriptado se verifica byte por byte contra el Apéndice A, sin red y sin mocks. Importa porque es la parte del proyecto donde un error no se ve: un cuerpo mal armado no tira excepción, el push service contesta 201 y el teléfono no muestra nada.

Los fixtures de `test/fixtures/` son la respuesta real de cada fuente, congelada. Cubren que nadie rompa un parser desde adentro; **no** avisan si la fuente cambia su HTML mañana, porque un fixture congelado no se entera de eso. Para eso hace falta mirar lo que devuelve la corrida real (ver `discardedBy`/`unknownVenues` más abajo).

La suite corre con `TZ=UTC` a propósito, igual que el Worker en Cloudflare. Sin eso, en una máquina que ya está en `America/Argentina/Buenos_Aires` los tests de huso horario pasan aunque el código no fuerce la zona.

`bunfig.toml` enforces a 24h supply-chain guard (`minimumReleaseAge`) blocking newly-published package versions. Adding a package to `minimumReleaseAgeExcludes` bypasses that guard — confirm with the user before adding any entry there.

## Deploying

**Pushing to `main` does not deploy anything.** There is no `.github/workflows`, and no deploy script in `package.json`. Deploys are manual:

- `bun run build` — produces `.output/`
- `npx wrangler deploy` — ships it (picks up `.wrangler/deploy/config.json` → `.output/server/wrangler.json`, worker `name: "app"`)

Live at `https://misconciertos.com.ar`. That origin is **not** hardcoded per-file — it lives in `src/lib/site.ts` as `SITE_URL`, which every canonical/OG/JSON-LD/sitemap/robots URL derives from. Change it there and nowhere else.

Cloudflare keeps the Worker's own `app.misconciertos.workers.dev` hostname serving alongside the custom domain, so `src/server.ts` 301s that host (`LEGACY_HOST` in the same module) to `SITE_URL` to avoid duplicate content. Two consequences worth remembering: anything server-side that POSTs to the app must target the custom domain, because `net.http_post` in Postgres does not follow redirects (this is why `supabase/migrations/20260801000000_point_ingest_cron_at_custom_domain.sql` exists), and Supabase Auth's Site URL / Redirect URLs allowlist must include the custom domain or `emailRedirectTo` silently falls back to the old one.

**Lovable's "Publish" button no longer works and is not expected to.** It fails with `dist-check failed with exit status 1` because that gate looks for a `dist/` directory, which this project stopped producing when it moved to nitro + Cloudflare Workers. Don't try to fix the Lovable publish — use wrangler.

To confirm a deploy actually landed, fetch the live page and grep the served bundle for a string you just added; a stale Worker will serve the old chunk even on a cache-busted request.

## Architecture

**Stack**: TanStack Start (React 19, file-based routing) rendered via SSR, built with Vite, deployed as a single Cloudflare Worker. Data lives in Supabase. UI is shadcn/ui ("new-york" style, `components.json`) with Tailwind v4.

**Build config**: `vite.config.ts` is explicit — it wires up Tailwind, `vite-tsconfig-paths`, `tanstackStart` (pointed at `src/server.ts` via `server: { entry: "server" }`) and `viteReact` by hand, and on `command === "build"` appends the `nitro` plugin with the `cloudflare-module` preset. There is no `@lovable.dev/*` package involved any more; add plugins directly to that array.

Build output goes to **`.output/`**, not `dist/` — `.output/server/index.mjs` is the Worker and `.output/public/` the assets. Nitro also generates its own `.output/server/wrangler.json` and a `.wrangler/deploy/config.json` pointing at it, which is why the build logs "Wrangler config main is overridden and will be ignored" for the checked-in `wrangler.jsonc`. Both output dirs are gitignored.

**Server entry chain**: Cloudflare invokes `src/server.ts`, which lazily imports TanStack's generated `server-entry`, calls its `fetch`, and post-processes the response: h3 (TanStack Start's request layer) swallows in-handler thrown errors into a 500 with a specific JSON shape instead of propagating them, so `src/server.ts` detects that shape and swaps in a branded HTML error page (`src/lib/error-page.ts`) instead of leaking the JSON. `src/start.ts` (`createStart`) registers the actual app-level middleware: `attachSupabaseAuth` (client-side function middleware, attaches the Supabase bearer token to every server-fn call) and a request-level try/catch that does the same 500 → branded-page substitution for the non-Worker (dev) path.

**Routing** (`src/routes/`, tree auto-generated into `src/routeTree.gen.ts` — don't hand-edit):
- `__root.tsx` — HTML shell, all SEO/OG meta, JSON-LD, and the app's 404/error boundaries.
- `index.tsx` — the map page: loads concerts client-side via the `listConcerts` server fn, renders `ConcertMap` (Leaflet) + `DateFilter` + a `ConcertDetails` panel/sheet + `AuthMenu`.
- `concierto.$slug.tsx` — per-concert public page (same detail blocks as the map panel, plus `ArtistAlert`).
- `agenda.tsx` — weekly agenda listing. `auth.tsx` — sign in/up.
- `_authenticated/route.tsx` — layout route; `beforeLoad` checks `supabase.auth.getUser()` client-side and redirects to `/auth` if unauthenticated (`ssr: false`). Children: `admin.stats.tsx` (admin-only click-stats table) and `perfil.tsx` (saved concerts + own comments).
- `api/public/hooks/*` — plain server routes (not server fns) used as webhooks: `ingest-concerts.ts` (see below) and `track-click.ts` (fire-and-forget insert into `concert_clicks` via the admin client, always returns 200).
- `sitemap[.]xml.ts` — dynamic sitemap. `google…[.]html.ts` — Search Console verification, served at an exact URL.

**Server functions** (`src/lib/*.functions.ts`, via `createServerFn`):
- `concerts.functions.ts` — `listConcerts`, public, uses the anon key directly (no auth middleware) since concerts are publicly readable.
- `stats.functions.ts` — `getClickStats`/`checkIsAdmin`, both go through the `requireSupabaseAuth` middleware then check the `has_role(user_id, 'admin')` RPC before touching admin-only data.

**Supabase clients** (`src/integrations/supabase/`):
- `client.ts` — anon browser client; reads `VITE_SUPABASE_*` (client bundle) falling back to unprefixed `SUPABASE_*` (SSR).
- `client.server.ts` — service-role admin client, bypasses RLS; server-only, never import from client code.
- `auth-middleware.ts` — server-side function middleware (`requireSupabaseAuth`) that verifies the `Authorization: Bearer` header via `getClaims` and injects `{ supabase, userId, claims }` into context.
- `auth-attacher.ts` — client-side function middleware that reads the current session and adds the bearer header; must stay registered in `src/start.ts`'s `functionMiddleware` or server fns silently lose auth.

**Data model** (`supabase/migrations/`):
- `public.concerts` (upserted on `(source, external_id)`) is the single source of truth for the map. All rows are scraped; the old `source='seed'` demo rows were deleted in `20260708200000_remove_seed_concerts.sql`, though `listConcerts` still filters `.neq("source", "seed")` defensively.
- `public.concert_clicks` logs "buy" clicks (inserted only via the service-role client — anon/authenticated INSERT was intentionally revoked).
- `public.user_roles` + `has_role()` implement a minimal admin role; a trigger auto-promotes the very first signed-up user to admin.
- `public.cron_secrets` holds the ingest webhook's shared secret (service-role only, no RLS policies at all, compared with `timingSafeEqual`).
- `public.profiles` (username per `auth.users` row, created by an `on_auth_user_created_profile` trigger) is **publicly readable by design** — `artist_comments` embeds `profiles(username)` in one PostgREST select to attribute comments, including for logged-out visitors. Lovable's schema review flags this as "all authenticated users can view every user's profile"; that's a false positive against this app's design, and restricting the SELECT to `auth.uid() = id` would break comment attribution. See the rationale comment in `20260709200938_add_profiles_and_artist_comments.sql`.
- `public.artist_comments` — publicly readable, INSERT restricted to `auth.uid() = user_id`. FK points at `profiles`, not `auth.users`, so the embed above works.
- `public.saved_concerts` — per-user, all three policies scoped to `auth.uid() = user_id`.
- `public.artist_alerts` — suscripciones a un artista puntual desde su ficha; anon INSERT, SELECT limited to admins via `has_role()`. (Lovable's review claims this table has no SELECT policy; it does.) **Los avisos salen en la misma invocación que el digest** (`?digest=1`), y a propósito: comparten la definición de "nuevo" —`digest_sent_at` en NULL— así que separarlos obligaría a llevar una segunda marca para lo mismo. El match es por `slugify` del artista, porque cada fuente lo escribe a su manera. Va un mail por persona y no por artista, y la baja es por suscripción (`unsubscribe_token`, `/baja?tipo=artista`): dar de baja un artista no toca ni el resumen ni los otros artistas.

  Ojo con la historia: durante meses esa ficha prometió "te vamos a avisar cuando {artista} anuncie un show nuevo" y **no había una sola línea que leyera la tabla**. Tres personas se anotaron y nunca recibieron nada. Si alguna vez se agrega otro formulario de suscripción, el trabajo no termina cuando el INSERT anda.
- `public.push_subscriptions` — el mismo aviso por artista pero por notificación del navegador, una fila por (artista, navegador). Tabla aparte y no una columna en `artist_alerts` porque lo que identifica a un suscripto es distinto: el mail identifica a una persona, el endpoint de push identifica un navegador, y la misma persona con teléfono y computadora son dos suscripciones. Ni anon ni authenticated escriben acá: el único camino es `/api/public/hooks/subscribe-push` con el cliente service-role. SELECT sólo para admins, igual que los mails.

  **Qué acepta ese endpoint vive en `src/lib/push-subscription.ts`**, puro y con tests, y no inline en el handler: es público, sin auth, y todo lo que pase de ahí entra a la base. Tres invariantes que no son obvias:

  - **Los largos de las claves son exactos, no "no vacío"** (87 y 22 caracteres base64url). Una suscripción con el `p256dh` cortado se guarda sin chistar y recién falla al encriptar, doce horas después, en otra máquina y sin nadie mirando.
  - **Sólo `https:`.** Aceptar cualquier URL convierte esto en un relay abierto: alguien suscribe un endpoint suyo y el Worker le postea dos veces por día, gratis y firmado con nuestras claves VAPID.
  - **La baja falla cerrada.** Un `concertId` con un typo no matchea nada; si se lo dejara pasar como "sin objetivo", la baja borraría *todas* las suscripciones de ese navegador en vez de una — pediste dejar de seguir un show y te quedás sin ningún aviso, sin enterarte. Un objetivo presente pero inválido es 400; `null` explícito sí es "de todo".

  Duplicados: el alta inserta y trata el 23505 como éxito, refrescando las claves (el navegador puede reemitir la misma suscripción con claves nuevas cuando se reinstala el service worker). **No se puede usar `upsert`**: los índices únicos son parciales y Postgres no infiere el ON CONFLICT contra un índice parcial.

  **Este canal tomó la decisión contraria a la del mail: corre en su propia invocación (`?push=1`) y lleva su propia marca, `concerts.push_sent_at`.** Sí, es una segunda marca para exactamente la misma definición de "nuevo", que es lo que el párrafo de arriba dice que se evitó. Se paga a propósito: compartiendo `digest_sent_at`, un push service caído dejaría los conciertos sin marcar y repetiría el mail a todo el mundo en la corrida siguiente. Separados, cada canal falla y reintenta solo.

  La tabla se limpia sola y por un solo lado: cuando un endpoint contesta 404 o 410 ya no existe del lado del navegador, y la corrida lo borra. Un 410 **no** cuenta como envío fallido — si contara, un teléfono viejo bloquearía el marcado y esos conciertos no se avisarían nunca. El service worker también avisa cuando el navegador rota una suscripción por su cuenta (`pushsubscriptionchange` → `accion: "migrar"`), porque él no sabe a qué artistas seguía ese endpoint: eso lo sabe la base.

  En iOS el push existe sólo si el sitio está agregado a la pantalla de inicio. `ArtistPush` lo detecta y lo dice en vez de esconder el botón, que es la diferencia entre "no se puede" y "falta un paso". Por eso el formulario de mail sigue estando al lado: no lo reemplaza.

  Desde el 19/09/2026 esta tabla guarda **dos suscripciones distintas**, y conviene tener clara la diferencia porque todo lo demás sale de ahí:

  | | seguir un artista (`artist`) | seguir un show (`concert_id`) |
  |---|---|---|
  | qué promete | te avisamos cuando anuncie algo | te avisamos el día antes |
  | cuándo sale | `?push=1`, con el digest | `?recordatorios=1`, dos veces por día |
  | qué se marca una vez | el concierto (`concerts.push_sent_at`) | la suscripción (`push_subscriptions.reminded_at`) |
  | desde dónde | `ArtistPush` | `ShowAlert` |

  Un `CHECK` obliga a que sea una o la otra, nunca las dos ni ninguna: una fila con los dos campos en NULL sería una suscripción a nada, invisible para las dos consultas y por lo tanto imposible de dar de baja. Y los índices únicos son **parciales**, uno por caso, porque en Postgres `(NULL, endpoint)` no choca con `(NULL, endpoint)` y con un solo UNIQUE alguien podría anotarse mil veces al mismo show. Ojo con eso al escribir: un `upsert` no funciona contra un índice parcial —Postgres no infiere el ON CONFLICT—, así que el alta inserta y maneja el 23505 a mano.

- `public.show_email_reminders` — el mismo recordatorio del día anterior, por mail. Es el fallback de `ShowAlert` cuando el push no va a llegar. Tabla propia y no una columna en `artist_alerts` porque esa es la otra promesa y el digest la lee entera slugificando `artist`: una fila con `artist` en NULL ahí adentro rompe la corrida de novedades. (Eso no es teórico: agregar `concert_id` a `push_subscriptions` rompió exactamente así el cruce de `?push=1`, y lo encontró `tsc` y no producción.)

**Ingest pipeline** (`src/routes/api/public/hooks/ingest-concerts.ts`): scheduled/cron-triggered POST, authenticated via the `cron_secrets` "ingest" value (not the anon key). Las seis fuentes —allevents.in, allaccess.com.ar, daleplay.la, la API CMS de ticketek.com.ar, livepass.com.ar y tuentrada.com— se leen con `fetch` directo y se parsean con las funciones puras de `src/lib/ingest-parsers.ts`. Resuelve lat/lng contra la tabla `VENUE_COORDS` de `src/lib/venues.ts`, descarta lo que no tenga título, fecha futura o coordenadas, y hace upsert en `concerts`. Soporta `?debug=1` para devolver lo parseado sin escribir, `?spotify=1` para el backfill de ids de Spotify, `?digest=1` para el mail de novedades, `?push=1` para los avisos por notificación y `?recordatorios=1` para el recordatorio del día anterior, cada uno en su propia invocación.

**Corre una fuente por invocación**, elegida con `?source=allaccess|daleplay|ticketek|livepass|tuentrada|allevents` (ver `src/lib/ingest-sources.ts`); sin el parámetro corren las seis, que es el modo para correr a mano y para `?debug=1`. Hay un job de `pg_cron` por fuente, escalonados de a seis minutos a partir de las 00:00 y 12:00 UTC, y dos más al final: `concert-digest` (:40) para el mail y `concert-push` (:45) para los avisos de shows nuevos.

**El recordatorio del día anterior ya no está acá**: desde el 20/09/2026 lo dispara un **Cron Trigger de Cloudflare** (ver abajo), no `pg_cron`. El job `show-reminders` quedó desprogramado en `20260920120000_recordatorios_los_dispara_cloudflare.sql`; la función `trigger_show_reminders()` sigue existiendo para dispararlo a mano desde el SQL editor sin armar el header del secreto. El orden no es casual: allaccess primero porque daleplay y ticketek se cruzan contra sus `buy_url` para no duplicar, y allevents última porque es la menos autoritativa —republica lo que ya venden las ticketeras— y así ve lo que las otras cinco acaban de escribir.

**Tu Entrada** (Ticketmaster Argentina) entró el 14/09/2026 y es la que vende Luna Park, el Gran Rex y el Teatro Colón: los tres estaban en `VENUE_COORDS` desde siempre y no tenían un solo show, porque ninguna de las otras cinco los vende. Su listado es la **home**, no `/busqueda?categoria=música`, que devuelve seis destacados fijos y no pagina. Entre los links de la home hay páginas de venue que no se distinguen por el slug: entran igual y se caen solas al parsear, porque sin fecha no hay evento.

Dos trampas de esa fuente, las dos con test. Publica la fecha dos veces y no coinciden —la visible dice "Miércoles 16 de Septiembre" y el `checkin` del embed de stay22 dice el 17, que cae jueves—: gana la visible, que trae el día de la semana y se valida sola. Y ese mismo embed pone **la coordenada del Obelisco, con quince decimales e idéntica, en toda ficha cuyo venue no reconoce**, incluido "Hipodromo De Tucuman": tomarla en serio mandaba shows de Tucumán al microcentro. Se descarta por valor exacto.

De ahí salió `estaEnBuenosAires` (`src/lib/venues.ts`), que es la última red antes del mapa: la coordenada que publica una fuente solo se usa si cae en la caja de la provincia. Sin eso entraba el Anfiteatro Municipal de Rosario, con coordenada real y bien puesta, en Santa Fe.

El mail de novedades sale de `?digest=1` y no del scrapeo: partido en cinco invocaciones, saldría un mail por fuente. Qué es "nuevo" lo dice `concerts.digest_sent_at` (NULL = todavía no se avisó), y solo se marca si no falló ningún envío, así que un problema con Resend hoy manda esos conciertos en el mail siguiente en vez de perderlos.

Live Pass es la única que publica coordenadas propias (en el JSON-LD de cada evento) y `toRow` las prefiere por sobre `VENUE_COORDS`: no dependen de que alguien haya cargado el lugar a mano. También es la única que hay que filtrar dos veces, porque vende de todo en todo el país: `isBuenosAiresRegion` la acota a Buenos Aires, y `pareceNoMusical` saca teatro, ballet y stand-up.

Ese segundo filtro es un colador y no un filtro, y conviene saberlo antes de tocarlo: Live Pass no publica la categoría en ningún lado —no está en el JSON-LD, no hay breadcrumb, y sus taxons agrupan por venue y no por género (`/taxons/teatro` es casi todo Café Berlín, que es música)—, así que lo único que queda es leer el título. Agarra lo que se nombra a sí mismo (una lectura, un stand-up) y no puede agarrar lo que no: "AUTOS ROBADOS en el Teatro Opera LP" es una obra y por el título es idéntica a un recital. Deja pasar alrededor del 5%.

**La ingesta tiene tres salidas, no dos: publicar, descartar y dudar.** El nivel del medio es `concerts.review_status` y es lo que hace posible que los filtros de lo no-musical sean agresivos. Antes eran binarios —lo que el filtro no agarraba se publicaba— asi que cada termino tenia que ser conservador, porque un falso positivo costaba un recital que no llegaba al mapa. Por eso `pareceNoMusical` es un colador y no un filtro, y por eso se colaron la Copa Libertadores y dos visitas guiadas.

`pareceDudoso` es el filtro que antes no se podia escribir: sospecha de "museo", "visita", "libertadores", "torneo". Equivocarse ahi cuesta un clic en la cola de revision (`/admin/revision`), no un show. Medido contra las 220 filas de ese momento, marcaba una sola — "Aniversario Copa Davis", que efectivamente es tenis.

Los estados: **NULL** es lo normal, nadie sospecho; **pendiente** lo puso la ingesta y no se publica ni se avisa por mail; **aprobado** y **rechazado** los pone una persona y la ingesta no los vuelve a tocar nunca (el `is null` en los dos updates es esa garantia). `rechazado` ademas resuelve algo viejo: **borrar una fila no alcanzaba para sacar un evento del mapa**, porque la ingesta arma su lista de conocidos leyendo la tabla y el link volvia a contar como nuevo. Una fila rechazada se queda en la base, invisible, y no vuelve — es lo que `SLUGS_NO_MUSICALES` venia parchando a mano.

Ojo con un detalle que no es obvio: el marcado que hace `upsert` **solo alcanza a lo que la corrida fetcheo**, y una fuente solo abre lo que no conoce. Sin el repaso que corre en `?digest=1` sobre todas las filas futuras con `review_status` en NULL, ampliar la lista de terminos no tendria efecto sobre nada de lo ya cargado.

**El alcance del mapa es toda la provincia de Buenos Aires**, no solo el AMBA: entran Junín, Bahía Blanca y Mar del Plata igual que La Plata o Quilmes. Lo que se descarta es lo de otras provincias, y de eso se ocupa `esDeOtraProvincia` (`src/lib/ingest-parsers.ts`), que mira la ciudad que publica la fuente y **nunca** el nombre del lugar: en CABA hay una avenida Santa Fe y una calle Córdoba. Es una lista de rechazo y no de aceptación a propósito — una ciudad bonaerense que no figure entra igual, y si el lugar no tiene coordenada queda anotado en `unknownVenues`; una lista de aceptación dejaría afuera en silencio cada suburbio que no se nos ocurrió.

Dale Play mete la ciudad adentro del nombre del lugar cuando el show es del interior ("Arena Maipú | Mendoza"). `parseDalePlayLive` la separa: sin eso el nombre queda sucio en la ficha y, peor, se rompe el match contra `VENUE_COORDS` —que compara por substring— así que hasta lugares cargados a mano se caían. Es lo que hacía perder el Hipódromo de La Plata corrida tras corrida.

Cada fuente reporta `found`/`scraped`/`upserted`/`discarded`/`skipped`, más `fueraDeZona` (lo que se descartó por provincia), `discardedBy` (por qué se cayó cada fila) y `unknownVenues` (los venues que faltan cargar en `VENUE_COORDS`).

**`unknownVenues` es la lista de trabajo**: cada nombre ahí es un show que no llega al mapa. Para que sirva tiene que estar limpia de lo que nunca íbamos a querer, y por eso el filtro de provincia corre antes. Al cargar un venue nuevo, buscar el POI en OpenStreetMap y usar esa coordenada — no estimar a ojo, que es de donde salieron los pines corridos que hubo que auditar. Ojo con las claves cortas: el match es por substring, así que "club estudiantes" le pondría el pin de Bahía Blanca a Estudiantes de La Plata.

**`found` es el número que importa para saber si una fuente se rompió**: es lo que el parser sacó del listado antes de descartar por conocidos, por provincia o por tope de fetches. `scraped` baja a cero solo cualquier día tranquilo, así que no sirve de señal; `found: 0` significa que la fuente cambió su HTML o dejó de responder lo esperado. Cuando eso pasa, la corrida manda un mail a `ALERT_EMAIL` (ver `sendIngestAlert`) y deja un `console.warn` en el log del Worker.

## El mail

**Resend ya está integrado y su API key ya está en los secrets del Worker.** Lo usan el digest de novedades, los avisos por artista y el recordatorio del día anterior, los tres desde `src/lib/email.server.ts`. No hace falta evaluar proveedores ni integrar nada: si algo no llega, el problema es de configuración, no de que falte infraestructura.

Estado real del dominio, verificado el 20/09/2026 contra DNS:

| | |
|---|---|
| MX (recibir) | Cloudflare Email Routing (`route1-3.mx.cloudflare.net`) |
| DKIM | `resend._domainkey.misconciertos.com.ar` presente ✓ |
| SPF del envío | `send.misconciertos.com.ar` → `include:amazonses.com` ✓ |
| SPF raíz | sólo `include:_spf.mx.cloudflare.net` — **correcto así** |
| DMARC | **no hay** ✗ |

Dos cosas que conviene entender de esa tabla antes de "arreglarla":

- **El SPF de la raíz no incluye a Resend y está bien.** Resend manda con el Return-Path en `send.misconciertos.com.ar`, que tiene su propio SPF; la alineación relajada de DMARC la da por buena porque es subdominio. Agregar `include:amazonses.com` a la raíz no suma nada y gasta uno de los 10 lookups de SPF.
- **Falta DMARC, y eso sí es un agujero.** Sin registro, cada receptor decide por su cuenta y el dominio queda abierto a spoofing. El paso siguiente es publicar un TXT en `_dmarc.misconciertos.com.ar` con `v=DMARC1; p=none; rua=mailto:dmarc@misconciertos.com.ar` —`p=none` es monitoreo, no bloquea nada— y recién endurecer a `quarantine` después de leer un par de semanas de reportes. Saltar directo a `p=reject` sin mirar los reportes es la forma conocida de matar el mail propio en silencio.

**El límite que importa del plan gratuito de Resend es 100 mails por día, no los 3.000 por mes.** Con el volumen de hoy —1 suscripción al digest, 5 avisos por artista— sobra muchísimo: el peor día manda menos de diez. El techo diario recién aprieta alrededor de los 90 suscriptos al digest, porque ese sale una vez por día a todos. Los avisos por artista y los recordatorios escalan con cuánta gente sigue algo que justo pasa ese día, así que crecen mucho más despacio.

## El Cron Trigger

Los recordatorios del día anterior los dispara Cloudflare, no Postgres. Cloudflare invoca el handler `scheduled` del Worker directamente: no hay salto HTTP, no hay secreto compartido, y no está el ruido del timeout de `net.http_post` —que corta a los 60s y deja registrado "timeout" aunque el Worker haya terminado bien—.

**El horario NO se configura en `wrangler.jsonc`.** Ese archivo se ignora en el deploy: nitro genera su propio `.output/server/wrangler.json` y `.wrangler/deploy/config.json` apunta ahí. Un `triggers.crons` escrito a mano ahí no haría nada, en silencio, que es la peor forma de fallar.

Sale de `scheduledTasks` en el plugin de nitro de `vite.config.ts`, junto con `experimental: { tasks: true }` y el registro de la task. Con eso el preset `cloudflare-module` escribe los `triggers.crons` en el wrangler generado y engancha el handler. **Después de tocar el horario, verificar que salió**:

```
grep -A 4 triggers .output/server/wrangler.json
```

La task vive en `src/tasks/recordatorios.ts` y es una cáscara: la lógica está en `src/lib/recordatorios.server.ts`, que también usa `?recordatorios=1` del hook de ingesta. Los dos caminos llaman a la misma función a propósito, para que no puedan divergir; el de HTTP queda para dispararlo a mano sin esperar a la corrida diaria.

Dos detalles que no son obvios:

- **`defineTask` se importa explícitamente** desde `nitro/task`. Nitro lo auto-importa en el build, pero `tsc --noEmit` no sabe de eso y el typecheck se cae.
- **El `handler` de la task se registra con path absoluto** (`fileURLToPath`). Nitro arma un módulo virtual con esos handlers y un `"./src/..."` relativo se le escapa como bare specifier, que rollup no resuelve.

Sobre la ventana de "24-48hs": está expresada como una fecha (`concerts.date = mañana`) y no como un rango de horas, porque `date` es una fecha y `time` es texto nullable — un show sin hora no cae en ningún rango de timestamps. Corriendo a las 08:30 de Buenos Aires, "los shows de mañana" son justamente los que están a entre 24 y 48 horas, y además no depende de a qué hora arrancó la corrida.

Y una cosa que el cron se lleva puesta si no se cuida: **corriendo sin nadie mirando, una consulta rota y un día sin suscriptos devuelven los mismos ceros.** Por eso el resumen que devuelve `enviarRecordatorios` trae el error de la consulta cuando lo hay, y la task lo loguea entero: es el mismo problema que `found` vs `scraped` en la ingesta, y la misma solución.

## Los dos techos de Cloudflare

Este proyecto se chocó con los dos, y los dos fallan igual de mal: sin error en el código, sin nada raro en los tests, y con un síntoma que aparece tarde. Vale conocerlos antes de tocar la ingesta o el render.

**Desde el 14/09/2026 la cuenta está en Workers Paid** (US$5/mes). No es un lujo: el plan gratuito no alcanzaba para servir el sitio, y eso tiró la producción entera. Los números de abajo son de ese plan.

**1. Subrequests — el límite de la ingesta.** Cada invocación del Worker tiene un tope de subrequests, y ahí entra todo: los fetches a las fuentes, cada llamada a Supabase y cada mail. Cuando se pasa, lo que corre último trae 0 y el mail de aviso falla, todo en silencio.

Eran **50** en el plan gratuito, y esa restricción moldeó media arquitectura: sacó la resolución de ids de Spotify del scrapeo (hoy la hace el cron `spotify-backfill-daily`), puso topes de fetches a allaccess, ticketek y livepass, y terminó partiendo la ingesta en una invocación por fuente.

Hoy son **10.000**, no 1000: en febrero de 2026 Cloudflare subió el default de los planes pagos y de paso lo hizo configurable hasta 10 millones con `limits.subrequests` en la config de Wrangler. Con eso cada fuente recorre su listado entero en una corrida y los topes de `TOPES` están dimensionados para eso, con margen de sobra.

Si algún día hay que subirlo de verdad, ojo: `limits` iría en `wrangler.jsonc`, **que en el deploy se ignora** —nitro genera su propio `.output/server/wrangler.json` y `.wrangler/deploy/config.json` apunta ahí, que es el mismo motivo del warning de "Wrangler config main is overridden"—. Habría que emitirlo desde el plugin de nitro en `vite.config.ts`.

El que se acerca al techo ya no es el scrapeo sino los **avisos por push**: los push services no tienen envío en lote como Resend (que manda de a 100 por request), así que va un POST por suscripción y el costo crece con la gente, no con las fuentes. Por eso corren en su propia invocación. `subrequestsPush` y `suscripcionesPushQueEntran` en `ingest-sources.ts` tienen el número, con su test.

Los topes y el modelo de costo viven en `src/lib/ingest-sources.ts`, y `test/ingest-sources.test.ts` verifica que el peor caso entre. Ese test es el único lugar donde se nota antes de tiempo que un tope quedó grande: en producción el síntoma es silencio. Si vas a subir un tope o sumar una fuente, el número que tiene que seguir cerrando es ese.

Con topes de tres cifras los fetches ya no pueden ir de a uno: en serie, 150 páginas son más de un minuto y el `net.http_post` del cron corta a los 60s (el Worker termina igual, pero queda registrado como timeout y parece una falla que no fue). Van de a seis con `enTandas` (`src/lib/en-tandas.ts`), que conserva el orden del listado y no deja que una página rota se lleve puesta la corrida.

**2. CPU por request — el límite del sitio.** El render SSR de una página cuesta CPU, y crece con el catálogo. Medido el 14/09/2026 con `npx wrangler tail`:

| Ruta | CPU |
|---|---|
| `/` | 104 ms |
| `/agenda` | 68 ms |
| `/conciertos` | 144 ms |

El plan gratuito daba **10 ms**, o sea diez veces menos de lo que la home necesita. Mientras el catálogo fue chico el sitio anduvo; cuando llegó a ~200 conciertos futuros cruzó la línea y **todas las páginas con SSR empezaron a devolver 503** (`Error 1102 — Worker exceeded resource limits`). El plan pago da 30 s, así que hoy sobra muchísimo.

Dos cosas que aprendimos ahí y conviene no volver a aprender: cuando el Worker muere por CPU, `wrangler tail` reporta `cpuTime` **cortado en el límite**, no el costo real — con 10 ms de techo parecía que faltaban 2 ms cuando en realidad faltaban 94. Y no hay recorte de datos que arregle eso: el piso del render de React ya se come el presupuesto, así que la única salida era el plan. Si algún día vuelve a aparecer un 1102, mirar el `cpuTime` real con el plan pago antes de sacar conclusiones.

**Env vars**: client-visible ones are `VITE_`-prefixed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`); server-only equivalents are unprefixed (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`) plus `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` y `VAPID_PRIVATE_KEY`, que viven en los secrets del Worker y no en el `.env` local.

La clave **pública** de VAPID no es una env var: es una constante en `src/lib/site.ts`, y a propósito. Es pública por definición —viaja en el bundle del cliente y se le manda al push service en cada envío—, así que lo único que aportaría una `VITE_` sería la trampa de siempre: Vite la resuelve en build time, una que falte no rompe el build y el opt-in sale al aire fallando en silencio, igual que el mapa con la marca de agua de Carto. Las dos claves van juntas: para firmar hay que armar un JWK con ambas, y regenerar la privada invalida todas las suscripciones existentes (los push services contestan 403). `VITE_CARTO_API_KEY` es la clave de los basemaps de Carto: Vite la resuelve en build time, así que tiene que estar en `.env` **antes** de buildear o el mapa sale con la marca de agua de "API KEY REQUIRED".

**Path alias**: `@/*` → `src/*` (see `tsconfig.json`, `components.json`).
