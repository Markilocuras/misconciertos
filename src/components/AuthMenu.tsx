import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type AuthMenuProps = {
  className?: string;
  /**
   * Modo angosto: el menú deja sólo lo imprescindible (el nombre de usuario y
   * el par iniciar-sesión/registrarse se esconden hasta xl). Lo prende la home
   * cuando abre la ficha lateral, que le saca 440px al header; sin esto el menú
   * es la pieza que no encoge y termina forzando una segunda fila.
   */
  compact?: boolean;
};

export function AuthMenu({ className, compact }: AuthMenuProps = {}) {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setUsername(null);
      return;
    }
    supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(({ data }) => setIsAdmin(!!data));
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setUsername(data?.username ?? null));
  }, [user]);

  // Mientras resuelve la sesión no devolvemos null. Si el menú no ocupa nada, el
  // header se arma sin él y se reacomoda recién cuando aparece —envolviendo a
  // dos filas si el ancho viene justo—, y el filtro que va anclado abajo salta.
  // Reservamos el lugar con la misma caja del estado deslogueado, invisible, así
  // el footprint coincide exacto sin medidas a mano.
  if (loading) return <SignedOutMenu className={className} compact={compact} placeholder />;

  if (user) {
    return (
      <div
        className={cn(
          "pointer-events-auto flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 shadow-lg backdrop-blur-md",
          className,
        )}
      >
        <Link
          to="/perfil"
          className="flex items-center gap-2 px-1 text-xs text-foreground transition hover:text-primary"
          title="Mi perfil"
        >
          <UserIcon className="h-3.5 w-3.5 text-primary" />
          <span
            className={cn("hidden max-w-[160px] truncate", compact ? "xl:inline" : "sm:inline")}
          >
            {username ?? user.email}
          </span>
        </Link>
        {isAdmin && (
          <Button asChild size="sm" variant="ghost" className="h-7 px-2" title="Estadísticas">
            <Link to="/admin/stats">
              <BarChart3 className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => supabase.auth.signOut()}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Cerrar sesión</span>
        </Button>
      </div>
    );
  }

  return <SignedOutMenu className={className} compact={compact} />;
}

/**
 * El menú de quien no inició sesión. Se usa también, con `placeholder`, para
 * reservarle el lugar al menú mientras la sesión resuelve: `invisible` lo saca
 * de la vista y del orden de tabulación pero le deja ocupar su espacio.
 */
function SignedOutMenu({
  className,
  compact,
  placeholder,
}: {
  className?: string;
  compact?: boolean;
  placeholder?: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur-md",
        placeholder && "invisible",
        className,
      )}
      aria-hidden={placeholder || undefined}
    >
      {/* Cuando las dos acciones no entran —celular, o modo angosto— dejamos una
          sola puerta de entrada. */}
      <Button asChild size="sm" className={cn("h-7", compact ? "xl:hidden" : "sm:hidden")}>
        <Link to="/auth" search={{ mode: "login" }}>
          Entrar
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant="ghost"
        className={cn("hidden h-7", compact ? "xl:inline-flex" : "sm:inline-flex")}
      >
        <Link to="/auth" search={{ mode: "login" }}>
          Iniciar sesión
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        className={cn("hidden h-7", compact ? "xl:inline-flex" : "sm:inline-flex")}
      >
        <Link to="/auth" search={{ mode: "register" }}>
          Registrarse
        </Link>
      </Button>
    </div>
  );
}
