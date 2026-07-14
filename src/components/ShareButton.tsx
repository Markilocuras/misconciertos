import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Concert } from "@/data/concerts";

export function ShareButton({ concert }: { concert: Concert }) {
  const share = async () => {
    const url = concert.slug
      ? `${window.location.origin}/concierto/${concert.slug}`
      : window.location.href;
    const title = `${concert.artist || concert.title} en ${concert.venue} — misconciertos`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // usuario canceló el share sheet: no es un error
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el link");
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={share}>
      <Share2 className="mr-1.5 h-3.5 w-3.5" />
      Compartir
    </Button>
  );
}
