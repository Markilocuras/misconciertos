import { useEffect, useState, type FormEvent } from "react";
import { BellRing, Check, Mail, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Concert } from "@/data/concerts";
import {
  claveDeAplicacion,
  contextoPush,
  leerEntorno,
  ofreceMail,
  recordarSeguido,
  seguidos,
  type ContextoPush,
} from "@/lib/push-entorno";
import { VAPID_PUBLIC_KEY } from "@/lib/site";
import { todayInBuenosAires } from "@/lib/timezone";
import { toast } from "sonner";

// "Avisame de este show": el recordatorio del día anterior.
//
// Es una promesa distinta a la de ArtistPush, que avisa cuando un artista
// anuncia algo. Acá el show ya tiene fecha —por eso estás en su página—, así
// que lo único que se puede prometer sin mentir es recordártelo antes.
//
// El botón tiene que funcionar en cuatro contextos que se comportan distinto, y
// decidir cuál es está en `contextoPush`, que es una función pura y con tests.
// Acá sólo queda qué mostrar en cada uno.

const MEMORIA = "misconciertos:push-shows";

type Estado = "cargando" | "no-aplica" | "listo" | "anotado" | "mail" | "mail-listo";

function Caja({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-accent/20 p-3">{children}</div>;
}

export function ShowAlert({ concert }: { concert: Concert }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [contexto, setContexto] = useState<ContextoPush | null>(null);
  const [dialogoIOS, setDialogoIOS] = useState(false);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Para un show de hoy el día anterior ya pasó: el botón prometería algo que
    // no puede cumplir. Se calcula acá y no en el render porque depende de la
    // hora de Buenos Aires y el HTML del server puede venir del día anterior.
    if (!concert.date || concert.date <= todayInBuenosAires()) {
      setEstado("no-aplica");
      return;
    }
    setContexto(contextoPush(leerEntorno()));
    setEstado(seguidos(MEMORIA).includes(concert.id) ? "anotado" : "listo");
  }, [concert.id, concert.date]);

  const anotarPush = async () => {
    const registro = await navigator.serviceWorker.register("/sw.js");
    // `register` resuelve antes de que el worker esté activo: sin esperar, el
    // subscribe puede correr contra un registro a medio instalar.
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
      body: JSON.stringify({
        concertId: concert.id,
        endpoint,
        p256dh: keys?.p256dh,
        auth: keys?.auth,
      }),
    });
    return res.ok;
  };

  const alTocar = async () => {
    if (!contexto) return;

    // iOS sin instalar: hay un paso concreto que la persona puede dar, así que
    // se lo explicamos en vez de ofrecerle el mail de consuelo.
    if (contexto.tipo === "ios-sin-instalar") {
      setDialogoIOS(true);
      return;
    }

    // Webview de Instagram, permiso denegado o navegador sin soporte: el push
    // no va a llegar nunca, así que ni lo intentamos.
    if (ofreceMail(contexto)) {
      setEstado("mail");
      return;
    }

    setEnviando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        // Rechazó: el navegador no lo vuelve a preguntar, así que el mail es la
        // única alternativa que queda.
        setContexto({ tipo: "bloqueado" });
        setEstado("mail");
        return;
      }

      if (await anotarPush()) {
        recordarSeguido(MEMORIA, concert.id, true);
        setEstado("anotado");
      } else {
        toast.error("No se pudo activar el aviso, probá de nuevo");
      }
    } catch (err) {
      console.error("[ShowAlert] no se pudo suscribir", err);
      toast.error("No se pudo activar el aviso, probá de nuevo");
    } finally {
      setEnviando(false);
    }
  };

  const enviarMail = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await fetch("/api/public/hooks/subscribe-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "mail",
          concertId: concert.id,
          email: email.trim().toLowerCase(),
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo guardar, probá de nuevo");
        return;
      }
      setEstado("mail-listo");
    } catch (err) {
      console.error("[ShowAlert] no se pudo guardar el mail", err);
      toast.error("No se pudo guardar, probá de nuevo");
    } finally {
      setEnviando(false);
    }
  };

  const darDeBaja = async () => {
    setEnviando(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const sub = await registro?.pushManager.getSubscription();
      if (sub) {
        // Sólo este show: el dispositivo puede seguir otros, y darse de baja de
        // uno no toca los demás. Por eso no se llama a sub.unsubscribe().
        await fetch("/api/public/hooks/subscribe-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "baja", endpoint: sub.endpoint, concertId: concert.id }),
        });
      }
      recordarSeguido(MEMORIA, concert.id, false);
      setEstado("listo");
    } catch (err) {
      console.error("[ShowAlert] no se pudo dar de baja", err);
      toast.error("No se pudo dar de baja, probá de nuevo");
    } finally {
      setEnviando(false);
    }
  };

  // Hasta saber en qué contexto estamos no se pinta nada: el server no puede
  // saberlo y cualquier cosa que elijamos acá sería distinta tras hidratar.
  if (estado === "cargando" || estado === "no-aplica") return null;

  if (estado === "anotado") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 p-3">
        <p className="flex items-center gap-2 text-sm text-foreground/90">
          <Check className="h-4 w-4 shrink-0 text-primary" />
          Te avisamos el día antes de este show.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 shrink-0"
          onClick={darDeBaja}
          disabled={enviando}
        >
          Ya no
        </Button>
      </div>
    );
  }

  if (estado === "mail-listo") {
    return (
      <p className="rounded-lg bg-primary/10 p-3 text-sm text-foreground/90">
        Listo — te escribimos a {email} el día antes del show.
      </p>
    );
  }

  if (estado === "mail") {
    // El motivo tiene que coincidir con lo que la persona acaba de ver. Salir
    // del instructivo de iOS por "Mejor por mail" y leer "tu navegador no
    // soporta notificaciones" se contradice con lo que le acabamos de explicar.
    const motivo =
      contexto?.tipo === "navegador-in-app"
        ? `Estás viendo esto dentro de ${contexto.app}, donde las notificaciones no funcionan.`
        : contexto?.tipo === "bloqueado"
          ? "Tenés las notificaciones bloqueadas para este sitio."
          : contexto?.tipo === "ios-sin-instalar"
            ? "Sin agregar el sitio a tu pantalla de inicio no podemos mandarte una notificación."
            : "Tu navegador no soporta notificaciones.";

    return (
      <Caja>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4 shrink-0 text-primary" />
          Te lo recordamos por mail
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {motivo} Dejanos tu mail y te escribimos el día antes.
        </p>
        <form onSubmit={enviarMail} className="mt-2 flex gap-2">
          <Input
            type="email"
            required
            placeholder="tu@email.com"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
          />
          <Button type="submit" size="sm" className="h-9 shrink-0" disabled={enviando}>
            {enviando ? "..." : "Avisame"}
          </Button>
        </form>
      </Caja>
    );
  }

  return (
    <>
      <Caja>
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BellRing className="h-4 w-4 shrink-0 text-primary" />
            Avisame de este show
          </p>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0"
            onClick={alTocar}
            disabled={enviando}
          >
            {enviando ? "..." : "Avisame"}
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Te mandamos una notificación el día antes, para que no se te pase.
        </p>
      </Caja>

      <AlertDialog open={dialogoIOS} onOpenChange={setDialogoIOS}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Share className="h-5 w-5 text-primary" />
              Agregá misconciertos a tu pantalla de inicio
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p>
                  En iPhone y iPad, Safari sólo manda notificaciones de los sitios que están
                  agregados a la pantalla de inicio. Es un momento y se hace una sola vez:
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    Tocá el botón <span className="font-medium text-foreground">Compartir</span> —el
                    cuadradito con la flecha, abajo en Safari.
                  </li>
                  <li>
                    Elegí{" "}
                    <span className="font-medium text-foreground">
                      Agregar a pantalla de inicio
                    </span>
                    .
                  </li>
                  <li>Abrí misconciertos desde el ícono nuevo y volvé a tocar “Avisame”.</li>
                </ol>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDialogoIOS(false);
                setEstado("mail");
              }}
            >
              Mejor por mail
            </Button>
            <AlertDialogAction>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
