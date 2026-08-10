import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface SiteFooterProps {
  className?: string;
}

/**
 * Pie con los links legales. Va en toda página que scrollee normal; el mapa
 * (que es pantalla completa) usa `SiteFooterOverlay`.
 */
export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground",
        className,
      )}
    >
      <FooterLinks className="justify-center" />
      <p className="mt-3">© {new Date().getFullYear()} misconciertos</p>
    </footer>
  );
}

/**
 * Variante flotante para el mapa: mismos links, apoyados abajo a la izquierda
 * sobre el canvas de Leaflet (la atribución de OSM vive abajo a la derecha).
 */
export function SiteFooterOverlay({ className }: SiteFooterProps) {
  return (
    <FooterLinks
      className={cn(
        "rounded-full border border-border/60 bg-background/85 px-3 py-1.5 shadow-lg backdrop-blur-md",
        className,
      )}
    />
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
