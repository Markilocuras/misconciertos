import { Link } from "@tanstack/react-router";
import { LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function AuthMenu() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2 px-1 text-xs text-foreground">
          <UserIcon className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[160px] truncate">{user.email}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut className="h-3.5 w-3.5" />
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
