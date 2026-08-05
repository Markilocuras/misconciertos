import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BellOff, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/baja")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Darse de baja — misconciertos" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const confirm = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/public/hooks/unsubscribe-digest", {
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
            <p className="mt-2 text-sm text-muted-foreground">
              Diste de baja los avisos de recitales nuevos. Podés volver a activarlos cuando quieras
              desde tu perfil.
            </p>
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
            <p className="mt-2 text-sm text-muted-foreground">
              No vas a recibir más el mail con los recitales nuevos que se suman al mapa.
            </p>
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
