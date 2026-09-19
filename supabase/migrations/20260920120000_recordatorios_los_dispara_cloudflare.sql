-- Los recordatorios pasan a dispararse desde Cloudflare, no desde pg_cron.
--
-- El job `show-reminders` de esta base y el Cron Trigger del Worker hacen
-- exactamente lo mismo. Dejar los dos no rompería nada —`reminded_at` hace que
-- la segunda corrida no repita el aviso— pero sí dejaría el horario definido en
-- dos lugares que se pueden desincronizar, y a nadie mirando el crontab de
-- Postgres se le ocurriría que la que manda es otra.
--
-- Qué se gana moviéndolo:
--
--   * No hay salto HTTP ni secreto compartido: Cloudflare invoca el handler
--     `scheduled` del Worker directamente.
--   * Se termina la confusión del timeout: `net.http_post` corta a los 60s y
--     deja registrado "timeout" en net._http_response aunque el Worker haya
--     terminado bien, así que una corrida sana parecía una falla.
--
-- Qué se pierde, y conviene tenerlo presente: el horario ya no se ve desde la
-- base. Vive en `scheduledTasks` de vite.config.ts, y el que manda en el deploy
-- es el `triggers.crons` del .output/server/wrangler.json que genera nitro
-- —nunca el wrangler.jsonc del repo, que se ignora—.
--
-- La ingesta, el digest y los avisos de artista siguen en pg_cron: esos cruzan
-- datos de esta base y disparan seis fuentes escalonadas, así que moverlos es
-- otra discusión.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'show-reminders') THEN
    PERFORM cron.unschedule('show-reminders');
  END IF;
END $$;

-- La función queda: `?recordatorios=1` sigue existiendo para dispararlo a mano
-- sin esperar a la madrugada, y este es el atajo para hacerlo desde el SQL
-- editor sin armar el header del secreto.
COMMENT ON FUNCTION public.trigger_show_reminders() IS
  'Dispara los recordatorios a mano. El camino normal es el Cron Trigger de Cloudflare (scheduledTasks en vite.config.ts); esto queda para no esperar a la corrida diaria.';
