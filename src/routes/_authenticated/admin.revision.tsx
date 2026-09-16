import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ExternalLink, ShieldQuestion, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { listPendingReview, resolveReview, type EnRevision } from "@/lib/review.functions";
import { formatConcertDate } from "@/data/concerts";

export const Route = createFileRoute("/_authenticated/admin/revision")({
  head: () => ({
    meta: [
      { title: "Revisión de dudosos — misconciertos" },
      {
        name: "description",
        content: "Panel interno de misconciertos para revisar los eventos que la ingesta dudó.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RevisionPage,
});

function RevisionPage() {
  const fetchPendientes = useServerFn(listPendingReview);
  const resolver = useServerFn(resolveReview);

  const [pendientes, setPendientes] = useState<EnRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Por fila, para que el botón que tocaste sea el que se bloquea.
  const [resolviendo, setResolviendo] = useState<string | null>(null);

  useEffect(() => {
    fetchPendientes()
      .then((res) => setPendientes(res.pendientes))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [fetchPendientes]);

  const decidir = useCallback(
    async (c: EnRevision, decision: "aprobado" | "rechazado") => {
      setResolviendo(c.id);
      try {
        await resolver({ data: { id: c.id, decision } });
        // Sale de la lista en el acto: la cola es para vaciarla, y volver a
        // pedirla entera por cada clic la haría saltar.
        setPendientes((prev) => prev.filter((p) => p.id !== c.id));
        toast.success(decision === "aprobado" ? "Va al mapa" : "Descartado, y no vuelve a entrar");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar");
      } finally {
        setResolviendo(null);
      }
    },
    [resolver],
  );

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al mapa
        </Link>

        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldQuestion className="h-6 w-6 text-primary" />
          Revisión de dudosos
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Lo que la ingesta sospechó que no era música y no publicó. Aprobar lo manda al mapa;
          descartar lo deja fuera para siempre — la fila se queda en la base justamente para que la
          ingesta no la vuelva a levantar en la próxima corrida.
        </p>

        {loading && <p className="mt-8 text-sm text-muted-foreground">Cargando…</p>}
        {error && (
          <p className="mt-8 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </p>
        )}

        {!loading && !error && pendientes.length === 0 && (
          <p className="mt-8 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No hay nada para revisar. Si la ingesta sospecha de algo, aparece acá.
          </p>
        )}

        <ul className="mt-8 space-y-3">
          {pendientes.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>{c.venue ?? "sin lugar"}</span>
                  {c.date && <span className="capitalize">{formatConcertDate(c.date)}</span>}
                  <span className="rounded-full bg-accent/60 px-2 py-0.5">{c.source}</span>
                  {c.buy_url && (
                    <a
                      href={c.buy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      ver en la fuente <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolviendo === c.id}
                  onClick={() => decidir(c, "rechazado")}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" /> No es música
                </Button>
                <Button
                  size="sm"
                  disabled={resolviendo === c.id}
                  onClick={() => decidir(c, "aprobado")}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Sí, al mapa
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
