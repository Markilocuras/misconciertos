# Plan: trackear clics en "Comprar entradas"

Sí, se puede — pero hay que agregarlo, hoy el botón es un `<a href>` directo a Ticketmaster/Ticketek/Allaccess y no queda registro de nada.

## Cómo lo resolvemos

Cada vez que un usuario clickea "Comprar entradas" en `ConcertDetails.tsx`, guardamos una fila en una tabla nueva `concert_clicks` antes de mandarlo al sitio externo. Después tenés una página simple `/admin/stats` donde ves cuántos clics tuvo cada concierto.

```
Usuario clickea "Comprar" 
   └─> POST /api/public/hooks/track-click  (fire-and-forget)
            └─> INSERT en concert_clicks (concert_id, source, clicked_at, user_agent)
   └─> window.open(buyUrl)  (abre Ticketmaster/etc)
```

## Cambios

1. **Migración**: tabla `public.concert_clicks`
   - `id`, `concert_id` (FK → concerts), `source`, `buy_url`, `clicked_at`, `user_agent`, `referrer`
   - RLS: `INSERT TO anon` permitido (cualquiera puede registrar un clic), `SELECT` solo para admins
   - GRANTs correspondientes

2. **Endpoint público** `src/routes/api/public/hooks/track-click.ts`
   - POST con `{ concertId }`, inserta la fila usando service role
   - Responde 200 rápido (no bloquea la navegación)

3. **`ConcertDetails.tsx`**: el botón pasa de `<a href>` a un `onClick` que:
   - Dispara `fetch('/api/public/hooks/track-click', ...)` con `keepalive: true`
   - Abre `buyUrl` en nueva pestaña

4. **Página admin** `/admin/stats` (protegida bajo `_authenticated` + check de rol admin):
   - Server function `getClickStats()` que hace un `GROUP BY concert_id` con joins a `concerts`
   - Tabla con: título, venue, fecha, total de clics, último clic
   - Opcional: filtro por rango de fechas

5. **Rol admin**: si todavía no existe el sistema de roles (`user_roles` + `has_role`), lo agrego en la misma migración y te dejo a vos como admin (necesito que me pases tu user id o lo marco al primer usuario registrado).

## Lo que NO incluye

- Tracking de vistas del concierto (sólo clics al botón de compra). Si querés también "cuántos abrieron el detalle", lo agregamos después.
- Analytics avanzados (conversiones reales, tiempo en página, geo). Para eso conviene Plausible/PostHog más adelante.
- Dashboard con gráficos — empieza como tabla simple, si querés gráficos los sumamos.

## Preguntas antes de implementar

- ¿Te alcanza con un total de clics por concierto, o querés ver también clics por día / por fuente (Ticketmaster vs Ticketek vs Allaccess)?
- ¿Ya tenés cuenta creada en la app? Si sí, decime el email y te marco como admin en la migración. Si no, lo dejo configurable después.
