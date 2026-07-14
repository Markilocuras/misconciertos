import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Concert } from "@/data/concerts";

export function BuyButton({ concert }: { concert: Concert }) {
  return (
    <Button
      size="lg"
      className="w-full"
      onClick={() => {
        // Guardarraíl: solo abrir URLs http(s), nunca javascript:/data:
        let safeUrl: string | null = null;
        try {
          const u = new URL(concert.buyUrl);
          if (u.protocol === "http:" || u.protocol === "https:") {
            safeUrl = u.toString();
          }
        } catch {
          safeUrl = null;
        }
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
        window.open(safeUrl, "_blank", "noopener,noreferrer");
      }}
    >
      <Ticket className="mr-2 h-4 w-4" />
      Comprar entradas
    </Button>
  );
}
