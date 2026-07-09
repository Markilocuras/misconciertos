import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function AuthMenu() {
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

  if (loading) return null;

  if (user) {
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2 px-1 text-xs text-foreground">
          <UserIcon className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[160px] truncate">{username ?? user.email}</span>
        </div>
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

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur-md">
      <Button asChild size="sm" variant="ghost" className="h-7">
        <Link to="/auth" search={{ mode: "login" }}>
          Iniciar sesión
        </Link>
      </Button>
      <Button asChild size="sm" className="h-7">
        <Link to="/auth" search={{ mode: "register" }}>
          Registrarse
        </Link>
      </Button>
    </div>
  );
}
