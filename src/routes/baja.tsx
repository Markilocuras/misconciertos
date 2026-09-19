import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BellOff, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/baja")({
  // `tipo=artista` llega desde los avisos por artista y `tipo=show` desde el
  // recordatorio del día anterior; sin él es el resumen de novedades, que es el
  // único que existía cuando se escribió esta página. Son tres suscripciones
  // distintas y se dan de baja por separado: quien se anotó a un artista
  // puntual no pidió dejar de recibir el resumen, ni al revés.
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
    tipo:
      search.tipo === "artista"
        ? ("artista" as const)
        : search.tipo === "show"
          ? ("show" as const)
          : ("digest" as const),
  }),
  head: () => ({
    meta: [
      { title: "Darse de baja — misconciertos" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UnsubscribePage,
});

// Cada baja es de una cosa distinta, y la página lo tiene que decir. Hasta
// ahora el texto hablaba siempre del resumen de novedades, así que quien
// llegaba desde un aviso de artista leía que estaba dando de baja otra cosa.
const COPY = {
  digest: {
    pregunta: "No vas a recibir más el mail con los recitales nuevos que se suman al mapa.",
    listo:
      "Diste de baja los avisos de recitales nuevos. Podés volver a activarlos cuando quieras desde tu perfil.",
  },
  artista: {
    pregunta:
      "No vas a recibir más el aviso cuando ese artista anuncie un show. Los otros artistas que sigas y el resumen de novedades no se tocan.",
    listo: "Diste de baja el aviso de ese artista. Los demás siguen activos.",
  },
  show: {
    pregunta: "No vas a recibir el recordatorio del día anterior a ese show.",
    listo: "Diste de baja el recordatorio de ese show. El resto de tus avisos sigue igual.",
  },
} as const;

function UnsubscribePage() {
  const { token, tipo } = Route.useSearch();
  const copy = COPY[tipo];
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const confirm = async () => {
    setState("sending");
    try {
      const endpoint =
        tipo === "artista"
          ? "/api/public/hooks/unsubscribe-alert"
          : tipo === "show"
            ? "/api/public/hooks/unsubscribe-show"
            : "/api/public/hooks/unsubscribe-digest";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 w-fit rounded-full bg-primary/15 p-3">
          <BellOff className="h-6 w-6 text-primary" />
        </div>

        {state === "done" ? (
          <>
            <h1 className="text-xl font-bold">Listo, no te escribimos más</h1>
            <p className="mt-2 text-sm text-muted-foreground">{copy.listo}</p>
          </>
        ) : !token ? (
          <>
            <h1 className="text-xl font-bold">Link incompleto</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link no trae el código de baja. Abrilo de nuevo desde el mail, o apagá los avisos
              desde tu perfil.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">¿Dejamos de avisarte?</h1>
            <p className="mt-2 text-sm text-muted-foreground">{copy.pregunta}</p>
            <Button
              onClick={confirm}
              disabled={state === "sending"}
              className="mt-5 w-full"
              variant="secondary"
            >
              {state === "sending" ? "Dando de baja..." : "Sí, darme de baja"}
            </Button>
            {state === "error" && (
              <p className="mt-3 text-sm text-destructive">
                No se pudo procesar. Probá de nuevo en un rato.
              </p>
            )}
          </>
        )}

        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <MapIcon className="h-4 w-4" /> Ver el mapa de recitales
        </Link>
      </div>
    </main>
  );
}
