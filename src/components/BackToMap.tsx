import { Link } from "@tanstack/react-router";
import { Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vuelta al mapa desde las páginas que no son el mapa.
 *
 * Va naranja y no como link discreto porque mucha gente cae en estas páginas
 * desde Google sin pasar por la home: es el único anzuelo para que descubran
 * el resto del sitio. No compite con "Comprar entradas" porque es más chico.
 */
export function BackToMap({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90",
        className,
      )}
    >
      <MapIcon className="h-4 w-4" />
      Ver el mapa de recitales
    </Link>
  );
}
