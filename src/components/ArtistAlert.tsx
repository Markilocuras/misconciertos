import { useState, type FormEvent } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ArtistAlert({ artist }: { artist: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase
      .from("artist_alerts")
      .insert({ artist, email: email.trim().toLowerCase() });
    setSubmitting(false);

    if (error && error.code === "23505") {
      // ya estaba suscripto: para el usuario es lo mismo que un éxito
      setDone(true);
      return;
    }
    if (error) {
      toast.error("No se pudo guardar la alerta, probá de nuevo");
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <p className="rounded-lg bg-primary/10 p-3 text-sm text-foreground/90">
        Listo — te vamos a avisar cuando {artist} anuncie un show nuevo.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-accent/20 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <BellRing className="h-4 w-4 text-primary" />
        Avisame cuando {artist} anuncie un show
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          required
          placeholder="tu@email.com"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9"
        />
        <Button type="submit" size="sm" className="h-9" disabled={submitting}>
          {submitting ? "..." : "Avisame"}
        </Button>
      </form>
    </div>
  );
}
