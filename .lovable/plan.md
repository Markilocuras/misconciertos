Voy a corregir esto en dos partes: datos reales y visibilidad en la app.

1. **Confirmar el estado actual**
   - La app publicada sí está mostrando los 6 conciertos semilla.
   - La base todavía no tiene conciertos reales scrapeados: sólo existe `source = seed`.
   - Publicar el sitio no alcanza por sí solo: falta que la ingesta real se ejecute bien y/o quede programada.

2. **Arreglar la ingesta**
   - Revisar el endpoint `/api/public/hooks/ingest-concerts` para que no dependa solamente de extracción JSON frágil.
   - Usar primero contenido markdown de Firecrawl y normalizar eventos desde fuentes más confiables.
   - Guardar sólo conciertos con fecha futura, venue y coordenadas.
   - Mejorar el reporte del endpoint para saber por fuente: cuántos encontró, cuántos guardó y por qué descartó eventos.

3. **Programarla automáticamente**
   - Agregar una migración para crear/actualizar el cron del backend que llame al endpoint de ingesta 2 veces por día.
   - Mantener la protección del endpoint para que no quede abierto a cualquiera.

4. **Mejorar la UI cuando no hay datos reales**
   - Cambiar el mensaje “sin datos — corré la ingesta” por un estado más útil.
   - Mostrar claramente si son conciertos de prueba o reales, para que no parezca que está vacío.

5. **Validar**
   - Probar la ingesta manualmente después del cambio.
   - Confirmar en la base que aparecen fuentes reales además de `seed`.
   - Verificar que la página publicada muestre los pines reales en el mapa.