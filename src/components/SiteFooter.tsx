import { Link } from "@tanstack/react-router";
import { Instagram } from "lucide-react";
import { INSTAGRAM_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

interface SiteFooterProps {
  className?: string;
}

/** Pie con los links legales. Va al final de toda página, la home incluida. */
export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground",
        className,
      )}
    >
      <FooterLinks className="justify-center" />

      <div className="mt-4 flex justify-center">
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Seguinos en Instagram (@misconciertos.ar)"
          title="@misconciertos.ar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Instagram className="h-4 w-4" />
        </a>
      </div>

      <p className="mt-3">© {new Date().getFullYear()} misconciertos</p>
    </footer>
  );
}

function FooterLinks({ className }: SiteFooterProps) {
  return (
    <nav
      aria-label="Enlaces legales"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}
    >
      {/* En celular los nombres largos rompen a dos líneas y chocan con la
          atribución de OSM en el mapa: ahí van abreviados. */}
      <Link to="/terminos" className="text-muted-foreground transition hover:text-foreground">
        Términos<span className="hidden sm:inline"> y Condiciones</span>
      </Link>
      <span aria-hidden className="text-border">
        ·
      </span>
      <Link to="/privacidad" className="text-muted-foreground transition hover:text-foreground">
        <span className="hidden sm:inline">Política de </span>Privacidad
      </Link>
      <span aria-hidden className="text-border">
        ·
      </span>
      <a
        href="mailto:support@misconciertos.com.ar"
        className="text-muted-foreground transition hover:text-foreground"
      >
        Contacto
      </a>
    </nav>
  );
}
