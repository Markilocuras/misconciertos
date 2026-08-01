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
- `bun run lint` — ESLint (flat config, `eslint.config.js`)
- `bun run format` — Prettier write (`.prettierrc`: 100 width, double quotes off i.e. `"`, trailing commas)

There is no test suite/framework configured in this repo currently.

`bunfig.toml` enforces a 24h supply-chain guard (`minimumReleaseAge`) blocking newly-published package versions. Adding a package to `minimumReleaseAgeExcludes` bypasses that guard — confirm with the user before adding any entry there.

## Deploying

**Pushing to `main` does not deploy anything.** There is no `.github/workflows`, and no deploy script in `package.json`. Deploys are manual:

- `bun run build` — produces `.output/`
- `npx wrangler deploy` — ships it (picks up `.wrangler/deploy/config.json` → `.output/server/wrangler.json`, worker `name: "app"`)

Live at `https://app.misconciertos.workers.dev` (this URL is also hardcoded in `src/routes/__root.tsx`'s SEO/OG/JSON-LD meta).

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

**Ingest pipeline** (`src/routes/api/public/hooks/ingest-concerts.ts`): scheduled/cron-triggered POST, authenticated via the `cron_secrets` "ingest" value (not the anon key). Scrapes a fixed list of Buenos Aires event-listing URLs with Firecrawl (`formats: ["markdown"]`), hand-parses the markdown into events (date/time/price/venue heuristics, Spanish+English month names), resolves venue lat/lng from a hardcoded `VENUE_COORDS` table, discards anything without a title/future date/coordinates, then upserts into `concerts`. Supports `?debug=1` to return raw scrape samples without writing to the DB.

**Env vars**: client-visible ones are `VITE_`-prefixed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`); server-only equivalents are unprefixed (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`) plus `SUPABASE_SERVICE_ROLE_KEY` and `FIRECRAWL_API_KEY`, which live in Cloudflare Worker secrets rather than the local `.env`.

**Path alias**: `@/*` → `src/*` (see `tsconfig.json`, `components.json`).
