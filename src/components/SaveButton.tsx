import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SaveButton({ concertId }: { concertId: string }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setSaved(false);
      return;
    }
    let cancelled = false;
    // RLS ya limita a las filas propias; solo hace falta filtrar por concierto.
    supabase
      .from("saved_concerts")
      .select("id")
      .eq("concert_id", concertId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSaved(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [user, concertId]);

  if (!user) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/auth" search={{ mode: "login" }}>
          <Heart className="mr-1.5 h-3.5 w-3.5" />
          Guardar
        </Link>
      </Button>
    );
  }

  const toggle = async () => {
    setBusy(true);
    if (saved) {
      const { error } = await supabase
        .from("saved_concerts")
        .delete()
        .eq("concert_id", concertId)
        .eq("user_id", user.id);
      if (!error) setSaved(false);
      else toast.error("No se pudo quitar, probá de nuevo");
    } else {
      const { error } = await supabase
        .from("saved_concerts")
        .insert({ concert_id: concertId, user_id: user.id });
      // 23505 = ya estaba guardado (doble click): lo tratamos como éxito.
      if (!error || error.code === "23505") setSaved(true);
      else toast.error("No se pudo guardar, probá de nuevo");
    }
    setBusy(false);
  };

  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={busy}>
      <Heart
        className={`mr-1.5 h-3.5 w-3.5 ${saved ? "fill-primary text-primary" : ""}`}
      />
      {saved ? "Guardado" : "Guardar"}
    </Button>
  );
}
