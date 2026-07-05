## Qué falta

Ya publicaste con las fuentes nuevas (Songkick BA, Movistar Arena, Luna Park). El cron corre a las 6:00 y 18:00 UTC — o sea, no scrapea ahora automáticamente.

## Propuesta

1. **Disparar la ingesta a mano una vez** contra la URL publicada, usando el secreto guardado en `cron_secrets`. Devuelve cuántos eventos scrapeó cada fuente.
2. **Mirar el resultado**:
   - Si Songkick/Movistar/Luna trajeron eventos → listo, el mapa se llena y no hay que hacer nada más. El cron sigue solo dos veces por día.
   - Si alguna fuente sigue en 0 → te digo cuál falló y por qué (bloqueo anti-bot, HTML raro, etc.) y ajustamos la lista de URLs.
3. **Opcional** (sólo si querés): borrar los 6 conciertos seed una vez que haya datos reales, para que el mapa muestre sólo lo scrapeado.

## Lo que hacés vos

Nada por ahora — decime "dale" y disparo la ingesta y te reporto.
