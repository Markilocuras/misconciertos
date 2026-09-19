import { useEffect, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  claveDeAplicacion,
  contextoPush,
  leerEntorno,
  recordarSeguido,
  seguidos,
  type ContextoPush,
} from "@/lib/push-entorno";
import { VAPID_PUBLIC_KEY } from "@/lib/site";
import { toast } from "sonner";

// Aviso por notificación cuando un artista anuncia un show nuevo. Es la otra
// promesa: ShowAlert recuerda un show que ya tiene fecha, esto avisa de los que
// todavía no existen.
//
// La detección de contexto es la misma y vive en push-entorno, que la tiene con
// tests. Acá la única diferencia con ShowAlert es que no hay fallback por mail:
// ese lugar ya lo ocupa ArtistAlert, que está justo abajo en la ficha.

const MEMORIA = "misconciertos:push";

type Estado = "cargando" | "listo" | "anotado";

export function ArtistPush({ artist }: { artist: string }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [contexto, setContexto] = useState<ContextoPush | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setContexto(contextoPush(leerEntorno()));
    setEstado(seguidos(MEMORIA).includes(artist) ? "anotado" : "listo");
  }, [artist]);

  const anotarse = async () => {
    setEnviando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        if (permiso === "denied") setContexto({ tipo: "bloqueado" });
        return;
      }

      const registro = await navigator.serviceWorker.register("/sw.js");
      // `register` resuelve antes de que el worker esté activo: sin esperar, el
      // subscribe de abajo puede correr contra un registro a medio instalar.
      await navigator.serviceWorker.ready;

      const sub =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          // Obligatorio: el navegador exige que cada push muestre algo.
          userVisibleOnly: true,
          applicationServerKey: claveDeAplicacion(VAPID_PUBLIC_KEY),
        }));

      const { endpoint, keys } = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const res = await fetch("/api/public/hooks/subscribe-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist, endpoint, p256dh: keys?.p256dh, auth: keys?.auth }),
      });

      if (!res.ok) {
        toast.error("No se pudo activar el aviso, probá de nuevo");
        return;
      }

      recordarSeguido(MEMORIA, artist, true);
      setEstado("anotado");
    } catch (err) {
      console.error("[ArtistPush] no se pudo suscribir", err);
      toast.error("No se pudo activar el aviso, probá de nuevo");
    } finally {
      setEnviando(false);
    }
  };

  const darseDeBaja = async () => {
    setEnviando(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const sub = await registro?.pushManager.getSubscription();
      if (sub) {
        // Sólo este artista: el dispositivo puede seguir a otros, y la baja de
        // uno no toca los demás. Por eso no se llama a sub.unsubscribe().
        await fetch("/api/public/hooks/subscribe-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "baja", endpoint: sub.endpoint, artist }),
        });
      }
      recordarSeguido(MEMORIA, artist, false);
      setEstado("listo");
    } catch (err) {
      console.error("[ArtistPush] no se pudo dar de baja", err);
      toast.error("No se pudo dar de baja, probá de nuevo");
    } finally {
      setEnviando(false);
    }
  };

  if (estado === "cargando" || !contexto) return null;

  // Sin push posible no se muestra nada: el formulario de mail de ArtistAlert,
  // que está justo abajo, ya cubre ese caso para esta misma promesa. Mostrar
  // también un cartel de "no se puede" sería ruido arriba de la alternativa.
  if (contexto.tipo !== "disponible") return null;

  if (estado === "anotado") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 p-3">
        <p className="flex items-center gap-2 text-sm text-foreground/90">
          <Check className="h-4 w-4 shrink-0 text-primary" />
          Te vamos a notificar cuando {artist} anuncie un show.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 shrink-0"
          onClick={darseDeBaja}
          disabled={enviando}
        >
          Ya no
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-accent/20 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <BellRing className="h-4 w-4 shrink-0 text-primary" />
        Notificame cuando {artist} anuncie un show
      </p>
      <Button
        type="button"
        size="sm"
        className="h-9 shrink-0"
        onClick={anotarse}
        disabled={enviando}
      >
        {enviando ? "..." : "Notificame"}
      </Button>
    </div>
  );
}
