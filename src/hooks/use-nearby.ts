import { useCallback, useState } from "react";
import type { Coords } from "@/lib/concert-filters";

export type NearbyStatus = "idle" | "locating" | "ready" | "denied" | "unavailable";

export type Nearby = {
  status: NearbyStatus;
  coords: Coords | null;
  request: () => void;
  clear: () => void;
};

// La ubicación solo se pide cuando el usuario toca el botón: nunca al cargar.
// Un permiso pedido de arranque, sin que se entienda para qué, se deniega — y
// una vez denegado el navegador no vuelve a preguntar.
export function useNearby(): Nearby {
  const [status, setStatus] = useState<NearbyStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus("ready");
      },
      (error) => {
        setCoords(null);
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      // Para ordenar recitales por cercanía alcanza con la ubicación gruesa, que
      // resuelve mucho más rápido y no prende el GPS del celular.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const clear = useCallback(() => {
    setCoords(null);
    setStatus("idle");
  }, []);

  return { status, coords, request, clear };
}
