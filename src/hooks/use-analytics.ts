import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { GA_ENABLED, trackPageView } from "@/lib/analytics";

// TanStack Router navega sin recargar la página, así que gtag.js corre una sola
// vez por visita: cada ruta resuelta tiene que reportar su propio page_view.
export function useAnalytics() {
  const router = useRouter();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!GA_ENABLED) return;

    const report = (path: string) => {
      // El primer onResolved puede repetir la ruta ya reportada al montar.
      if (lastPath.current === path) return;
      lastPath.current = path;
      trackPageView(path);
    };

    report(window.location.pathname + window.location.search);

    return router.subscribe("onResolved", ({ toLocation }) => {
      report(toLocation.pathname + toLocation.searchStr);
    });
  }, [router]);
}
