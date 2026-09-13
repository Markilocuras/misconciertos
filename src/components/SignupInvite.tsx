import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, MessageSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

// Preferencia local de quien ya lo cerró. Mismo criterio que el aviso de
// BuyButton: solo se lee y se escribe dentro de effects y handlers, nunca en
// render, porque el servidor no tiene localStorage y la hidratación no puede
// depender de él.
const DISMISSED_KEY = "misconciertos:invite-dismissed";

function yaLoCerro(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function recordarQueLoCerro() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // modo privado / storage bloqueado: se va a volver a mostrar, y no pasa nada
  }
}

// Aparece un rato después de cargar, no de una. Recién llegado, lo que la
// persona vino a hacer es mirar el mapa; taparlo en el primer frame es la forma
// más rápida de que cierre sin leer.
const DEMORA_MS = 1800;

/**
 * `paused` la esconde mientras hay una ficha de concierto abierta, sin perder
 * el estado. Es un prop y no un desmontaje desde el padre a propósito: si el
 * padre la sacara del árbol, cerrar la ficha la volvería a montar y arrancaría
 * la demora de nuevo, o sea que insistiría con alguien que ya la había visto y
 * no la cerró. Además en celular la ficha también va en z-20, así que si no se
 * corre quedan las dos superpuestas.
 */
export function SignupInvite({ paused = false }: { paused?: boolean }) {
  const { user, loading } = useAuth();
  const [visible, setVisible] = useState(false);

  const cerrar = useCallback(() => {
    setVisible(false);
    recordarQueLoCerro();
  }, []);

  useEffect(() => {
    // Con sesión no tiene sentido: ya tiene las dos cosas que ofrece.
    if (loading || user) {
      setVisible(false);
      return;
    }
    if (yaLoCerro()) return;
    const t = setTimeout(() => setVisible(true), DEMORA_MS);
    return () => clearTimeout(t);
  }, [loading, user]);

  // Escape cierra, como cualquier cosa que se superpone. No es un dialog modal
  // —el mapa de atrás se sigue usando— así que no hay foco atrapado ni overlay
  // que bloquee: por eso el Escape se escucha a nivel window y no en el nodo.
  // Incluye `paused`: sin eso, el Escape con el que se cierra una ficha de
  // concierto daría por descartada una tarjeta que en ese momento no está a la
  // vista, y la persona nunca la vería.
  useEffect(() => {
    if (!visible || paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, paused, cerrar]);

  if (!visible || paused) return null;

  return (
    // El contenedor no recibe clicks: solo la tarjeta. Así el mapa sigue
    // arrastrable alrededor, que es lo que hace que esto se sienta un aviso y
    // no un peaje.
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4"
      role="region"
      aria-label="Invitación a crear una cuenta"
    >
      <div className="pointer-events-auto relative w-full max-w-sm rounded-2xl border border-border bg-card/95 p-5 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="pr-6 text-base font-semibold tracking-tight">
          Creá tu cuenta y no te pierdas nada
        </h2>

        <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Te avisamos por mail cuando se anuncian recitales nuevos en Buenos Aires.</span>
          </li>
          <li className="flex gap-2.5">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Dejá comentarios en la ficha de cada artista y leé los de los demás.</span>
          </li>
        </ul>

        <div className="mt-4 flex items-center gap-2">
          {/* `avisos=1` deja tildada la casilla de mails en el registro. Sin
              eso el checkbox arranca apagado y esta tarjeta estaría prometiendo
              algo que no pasa: el trigger que suscribe al digest solo corre si
              el alta viaja con notify_new_concerts en true. Igual queda a la
              vista y se puede destildar. */}
          <Button asChild size="sm" className="flex-1">
            <Link to="/auth" search={{ mode: "register", avisos: true }}>
              Crear cuenta
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/auth" search={{ mode: "login" }}>
              Ya tengo
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
