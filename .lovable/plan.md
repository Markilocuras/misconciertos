## Objetivo

Activar la ingesta automática de conciertos con Firecrawl, espaciada para gastar menos créditos, y limpiar los datos seed para que sólo queden los reales scrapeados.

## Cambios

### 1. Borrar los 6 conciertos seed
`DELETE FROM public.concerts WHERE source = 'seed';`

Se ejecuta antes de activar el cron para que el mapa quede vacío hasta la primera corrida real. Si preferís mantenerlos hasta que scrapee al menos una vez, decime y lo dejamos para después.

### 2. Programar cron `pg_cron` cada 12 horas
Job que llama a `POST https://project--d6e08755-1efd-4cef-b0e2-632923d03f02.lovable.app/api/public/hooks/ingest-concerts` cada 12 h (a las 6:00 y 18:00 UTC → 3:00 y 15:00 hora Argentina).

```sql
SELECT cron.schedule(
  'ingest-concerts-twice-daily',
  '0 6,18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d6e08755-1efd-4cef-b0e2-632923d03f02.lovable.app/api/public/hooks/ingest-concerts',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Consumo estimado: 3 URLs × 2 corridas/día ≈ **6 créditos Firecrawl/día** (~180/mes).

### 3. Habilitar extensiones (si no están ya)
`CREATE EXTENSION IF NOT EXISTS pg_cron;` y `CREATE EXTENSION IF NOT EXISTS pg_net;`

## Pasos que hacés vos después

1. Publicar la web (botón arriba a la derecha) — necesario para que la URL del cron funcione.
2. Ir a `/auth` y crear tu cuenta → quedás como admin automáticamente.
3. Esperar la primera corrida (o dispararla a mano desde acá si querés ver resultados ya).
4. Revisar `/admin/stats` una vez que la gente empiece a clickear "Comprar entradas".

## Lo que NO hace este plan

- No cambia frecuencia de scraping después (si querés más/menos, se ajusta con otro `cron.schedule`).
- No agrega nuevas fuentes de scraping (siguen Ticketmaster/Ticketek/Allaccess).
- No conecta dominio propio ni cambia visibilidad — eso se hace desde Project Settings cuando quieras.
