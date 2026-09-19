import { defineTask } from "nitro/task";

import { enviarRecordatorios } from "@/lib/recordatorios.server";

// El Cron Trigger de Cloudflare que manda los recordatorios del día anterior.
//
// Es una task de nitro, no una ruta: cuando `experimental.tasks` y
// `scheduledTasks` están configurados (ver vite.config.ts), el preset
// cloudflare-module escribe los `triggers.crons` en el wrangler.json generado y
// engancha el handler `scheduled` del Worker. Eso importa acá más que en otros
// proyectos: el wrangler.jsonc del repo **se ignora en el deploy** —nitro genera
// el suyo y .wrangler/deploy/config.json apunta ahí—, así que un `[triggers]`
// escrito a mano en ese archivo no haría absolutamente nada.
//
// Cloudflare invoca esto directamente, sin pasar por HTTP: no hay secreto que
// verificar, no hay round trip, y no hay timeout de `net.http_post` que
// confunda una corrida buena con una fallada.
export default defineTask({
  meta: {
    name: "recordatorios",
    description: "Avisa a quien se anotó por los shows de mañana (push y mail)",
  },
  async run() {
    const resumen = await enviarRecordatorios();
    // Los logs del Worker no se guardan solos: esto es lo que se ve con
    // `npx wrangler tail` cuando hay que entender qué pasó una madrugada.
    console.log("[recordatorios]", JSON.stringify(resumen));
    return { result: resumen };
  },
});
