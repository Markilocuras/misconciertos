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

**Tests**: Vitest, en `test/`, con su propia `vitest.config.ts` (mínima a propósito: `vite.config.ts` arma toda la app con nitro y el plugin de TanStack, y nada de eso hace falta para funciones puras). Cubren los parsers de la ingesta, el matching de `VENUE_COORDS` y el cálculo de "hoy" en hora argentina.

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
- `public.artist_alerts` — email subscriptions; anon INSERT, SELECT limited to admins via `has_role()`. (Lovable's review claims this table has no SELECT policy; it does.)

**Ingest pipeline** (`src/routes/api/public/hooks/ingest-concerts.ts`): scheduled/cron-triggered POST, authenticated via the `cron_secrets` "ingest" value (not the anon key). Las cinco fuentes —allevents.in, allaccess.com.ar, daleplay.la, la API CMS de ticketek.com.ar y livepass.com.ar— se leen con `fetch` directo y se parsean con las funciones puras de `src/lib/ingest-parsers.ts`. Resuelve lat/lng contra la tabla `VENUE_COORDS` de `src/lib/venues.ts`, descarta lo que no tenga título, fecha futura o coordenadas, y hace upsert en `concerts`. Soporta `?debug=1` para devolver lo parseado sin escribir, `?spotify=1` para el backfill de ids de Spotify y `?digest=1` para el mail de novedades, cada uno en su propia invocación.

**Corre una fuente por invocación**, elegida con `?source=allaccess|daleplay|ticketek|livepass|allevents` (ver `src/lib/ingest-sources.ts`); sin el parámetro corren las cinco, que es el modo para correr a mano y para `?debug=1`. Hay un job de `pg_cron` por fuente, escalonados de a seis minutos a partir de las 00:00 y 12:00 UTC, y uno más (`concert-digest`, :35) para el mail. El orden no es casual: allaccess primero porque daleplay y ticketek se cruzan contra sus `buy_url` para no duplicar, y allevents última porque es la menos autoritativa —republica lo que ya venden las ticketeras— y así ve lo que las otras cuatro acaban de escribir.

El mail de novedades sale de `?digest=1` y no del scrapeo: partido en cinco invocaciones, saldría un mail por fuente. Qué es "nuevo" lo dice `concerts.digest_sent_at` (NULL = todavía no se avisó), y solo se marca si no falló ningún envío, así que un problema con Resend hoy manda esos conciertos en el mail siguiente en vez de perderlos.

Live Pass es la única que publica coordenadas propias (en el JSON-LD de cada evento) y `toRow` las prefiere por sobre `VENUE_COORDS`: no dependen de que alguien haya cargado el lugar a mano. También es la única que hay que filtrar dos veces, porque vende de todo en todo el país: `isBuenosAiresRegion` la acota a Buenos Aires, y `pareceNoMusical` saca teatro, ballet y stand-up.

Ese segundo filtro es un colador y no un filtro, y conviene saberlo antes de tocarlo: Live Pass no publica la categoría en ningún lado —no está en el JSON-LD, no hay breadcrumb, y sus taxons agrupan por venue y no por género (`/taxons/teatro` es casi todo Café Berlín, que es música)—, así que lo único que queda es leer el título. Agarra lo que se nombra a sí mismo (una lectura, un stand-up) y no puede agarrar lo que no: "AUTOS ROBADOS en el Teatro Opera LP" es una obra y por el título es idéntica a un recital. Deja pasar alrededor del 5%.

**El alcance del mapa es toda la provincia de Buenos Aires**, no solo el AMBA: entran Junín, Bahía Blanca y Mar del Plata igual que La Plata o Quilmes. Lo que se descarta es lo de otras provincias, y de eso se ocupa `esDeOtraProvincia` (`src/lib/ingest-parsers.ts`), que mira la ciudad que publica la fuente y **nunca** el nombre del lugar: en CABA hay una avenida Santa Fe y una calle Córdoba. Es una lista de rechazo y no de aceptación a propósito — una ciudad bonaerense que no figure entra igual, y si el lugar no tiene coordenada queda anotado en `unknownVenues`; una lista de aceptación dejaría afuera en silencio cada suburbio que no se nos ocurrió.

Dale Play mete la ciudad adentro del nombre del lugar cuando el show es del interior ("Arena Maipú | Mendoza"). `parseDalePlayLive` la separa: sin eso el nombre queda sucio en la ficha y, peor, se rompe el match contra `VENUE_COORDS` —que compara por substring— así que hasta lugares cargados a mano se caían. Es lo que hacía perder el Hipódromo de La Plata corrida tras corrida.

Cada fuente reporta `found`/`scraped`/`upserted`/`discarded`/`skipped`, más `fueraDeZona` (lo que se descartó por provincia), `discardedBy` (por qué se cayó cada fila) y `unknownVenues` (los venues que faltan cargar en `VENUE_COORDS`).

**`unknownVenues` es la lista de trabajo**: cada nombre ahí es un show que no llega al mapa. Para que sirva tiene que estar limpia de lo que nunca íbamos a querer, y por eso el filtro de provincia corre antes. Al cargar un venue nuevo, buscar el POI en OpenStreetMap y usar esa coordenada — no estimar a ojo, que es de donde salieron los pines corridos que hubo que auditar. Ojo con las claves cortas: el match es por substring, así que "club estudiantes" le pondría el pin de Bahía Blanca a Estudiantes de La Plata.

**`found` es el número que importa para saber si una fuente se rompió**: es lo que el parser sacó del listado antes de descartar por conocidos, por provincia o por tope de fetches. `scraped` baja a cero solo cualquier día tranquilo, así que no sirve de señal; `found: 0` significa que la fuente cambió su HTML o dejó de responder lo esperado. Cuando eso pasa, la corrida manda un mail a `ALERT_EMAIL` (ver `sendIngestAlert`) y deja un `console.warn` en el log del Worker.

**El presupuesto de subrequests es el límite real de la ingesta.** Cloudflare corta la invocación a los 50 y ahí entra todo: los fetches a las fuentes, cada llamada a Supabase y cada mail. Cuando se pasa, lo que corre último trae 0 y el mail de aviso falla, todo en silencio. Es lo que empujó la resolución de ids de Spotify fuera del scrapeo (la hace el cron `spotify-backfill-daily`), lo que puso topes de fetches a allaccess, ticketek y livepass, y lo que terminó partiendo la ingesta en una invocación por fuente.

Los topes y el modelo de costo viven en `src/lib/ingest-sources.ts`, y `test/ingest-sources.test.ts` verifica que el peor caso de cada modo entre en los 50. Ese test es el único lugar donde se nota antes de tiempo que un tope quedó grande: en producción el síntoma es silencio. Si vas a subir un tope o sumar una fuente, el número que tiene que seguir cerrando es ese.

**Env vars**: client-visible ones are `VITE_`-prefixed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`); server-only equivalents are unprefixed (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`) plus `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` y `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`, que viven en los secrets del Worker y no en el `.env` local. `VITE_CARTO_API_KEY` es la clave de los basemaps de Carto: Vite la resuelve en build time, así que tiene que estar en `.env` **antes** de buildear o el mapa sale con la marca de agua de "API KEY REQUIRED".

**Path alias**: `@/*` → `src/*` (see `tsconfig.json`, `components.json`).
