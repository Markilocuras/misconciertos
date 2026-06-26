# Plan: ingesta automática de conciertos

Reemplazar el array hardcodeado de `src/data/concerts.ts` por una tabla en la base, alimentada cada X horas desde Ticketmaster (API oficial) + Ticketek/Allaccess (scraping con Firecrawl).

## Lo que vas a tener que aportar

1. **API key de Ticketmaster Discovery API** — gratis en https://developer-acct.ticketmaster.com (la guardamos como secret `TICKETMASTER_API_KEY`).
2. **Conectar Firecrawl** desde Lovable (un click — para Ticketek y Allaccess, que no tienen API pública).
3. **URLs base** que querés scrapear de Ticketek/Allaccess (ej: la página de listado de Buenos Aires).

## Arquitectura

```
pg_cron (cada 6h)
   └─> POST /api/public/hooks/ingest-concerts
            ├─> Ticketmaster API  (eventos AR, classificationName=music)
            ├─> Firecrawl scrape Ticketek listing pages
            └─> Firecrawl scrape Allaccess listing pages
                     └─> UPSERT en tabla `concerts` (dedupe por source + external_id)
```

El mapa y el sidebar leen de la tabla `concerts` vía un server function público (lectura anónima con policy `TO anon SELECT`), nada cambia en la UI salvo el origen de los datos.

## Pasos de implementación

1. **Migración DB**: tabla `public.concerts` con campos:
   - `id`, `source` (`'ticketmaster' | 'ticketek' | 'allaccess'`), `external_id`, `title`, `artist`, `venue`, `date`, `time`, `price`, `description`, `image_url`, `lat`, `lng`, `buy_url`, `last_seen_at`, `created_at`, `updated_at`
   - UNIQUE(`source`, `external_id`) para upsert
   - RLS + `GRANT SELECT TO anon` (lectura pública), escritura solo `service_role`

2. **Server route** `src/routes/api/public/hooks/ingest-concerts.ts`:
   - Auth con `apikey` header (anon key, patrón estándar de cron)
   - Llama Ticketmaster: `GET https://app.ticketmaster.com/discovery/v2/events.json?countryCode=AR&classificationName=Music&apikey=...`
   - Llama Firecrawl scrape con formato `json` + schema para Ticketek/Allaccess
   - Geocoding de venues (Ticketmaster ya devuelve lat/lng; para los otros uso Nominatim gratis o dejo coords del venue mapeadas a mano)
   - UPSERT con `supabaseAdmin` (cargado dentro del handler)
   - Devuelve `{ inserted, updated, errors }`

3. **Server function pública** `src/lib/concerts.functions.ts`:
   - `listConcerts()` con server publishable client → SELECT de la tabla
   - Reemplaza el import de `src/data/concerts.ts` en `src/routes/index.tsx`

4. **Cron job** (vía `supabase--insert`):
   - `cron.schedule('ingest-concerts', '0 */6 * * *', net.http_post(...))` cada 6 horas

5. **Página admin opcional** `/admin/ingest` con botón "Run now" para disparar la ingesta manual mientras testeás (protegida por `_authenticated` + rol admin).

## Detalles técnicos

- **Ticketmaster**: Discovery API v2, free tier 5000 req/día, devuelve JSON estructurado con venue.location.{latitude,longitude}, imágenes, fechas ISO, link a compra. Mapeo directo.
- **Ticketek/Allaccess**: Firecrawl con `formats: [{ type: 'json', schema: z.object({ events: z.array(...) }) }]` para extracción estructurada por LLM. Más frágil — si cambian el HTML hay que ajustar el prompt.
- **Dedupe**: si el mismo concierto aparece en dos sources, quedan como dos rows (distinto `source`). Si querés merge, lo agregamos después con un campo `canonical_id`.
- **Datos viejos**: los eventos con `date < today` se ocultan en la query del front; opcional purgar con otro cron.

## Lo que NO incluye este plan

- Filtrado por ciudad (ahora trae todo AR; si querés solo Buenos Aires lo filtro en la query).
- Notificaciones de eventos nuevos.
- Reviews / ratings / favoritos por usuario.

¿Le damos así, o ajustamos algo (frecuencia del cron, sources, ciudades)?
