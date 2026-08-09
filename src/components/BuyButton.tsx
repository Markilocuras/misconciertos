import { useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Concert } from "@/data/concerts";
import { trackEvent } from "@/lib/analytics";

// Preferencia local de quien ya vio el aviso y no lo quiere volver a ver.
// Solo se lee/escribe dentro de handlers, nunca en render, para no romper la hidratación.
const SKIP_NOTICE_KEY = "misconciertos:skip-buy-notice";

function shouldSkipNotice(): boolean {
  try {
    return localStorage.getItem(SKIP_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSkipNotice() {
  try {
    localStorage.setItem(SKIP_NOTICE_KEY, "1");
  } catch {
    // modo privado / storage bloqueado: el aviso simplemente se sigue mostrando
  }
}

// Guardarraíl: solo abrir URLs http(s), nunca javascript:/data:
function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function BuyButton({ concert }: { concert: Concert }) {
  const [open, setOpen] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const safeUrl = useMemo(() => safeHttpUrl(concert.buyUrl), [concert.buyUrl]);
  const host = useMemo(() => (safeUrl ? hostLabel(safeUrl) : ""), [safeUrl]);

  // La redirección se cuenta acá: una fila en concert_clicks == una salida real
  // al sitio de venta. Si cancelan el aviso no se registra nada.
  //
  // El mismo click va también a GA: concert_clicks guarda el dato crudo y sirve
  // para /admin/stats, GA lo cruza con la fuente de tráfico de la sesión.
  function redirect() {
    if (!safeUrl) return;
    try {
      fetch("/api/public/hooks/track-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concertId: concert.id, buyUrl: safeUrl }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }
    trackEvent("buy_click", {
      concert_id: concert.id,
      concert_title: concert.title,
      artist: concert.artist,
      venue: concert.venue,
      link_domain: host,
    });
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          if (!safeUrl) return;
          if (shouldSkipNotice()) {
            redirect();
            return;
          }
          setDontAskAgain(false);
          setOpen(true);
        }}
      >
        <Ticket className="mr-2 h-4 w-4" />
        Comprar entradas
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              Vas a salir de misconciertos
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Te vamos a llevar a <span className="font-medium text-foreground">{host}</span>,
                  un sitio que no nos pertenece. La compra, el pago y las entradas se gestionan
                  íntegramente ahí.
                </p>
                <p className="flex items-start gap-2 rounded-md bg-accent p-3 text-accent-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Es el punto de venta oficial del evento. No revendemos entradas ni cobramos
                    ningún cargo extra.
                  </span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            No volver a mostrar este aviso
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dontAskAgain) rememberSkipNotice();
                redirect();
              }}
            >
              Continuar a {host}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
