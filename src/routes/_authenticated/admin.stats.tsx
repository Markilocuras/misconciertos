import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getClickStats, type ClickStat } from "@/lib/stats.functions";
import { ArrowLeft, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/stats")({
  head: () => ({
    meta: [
      { title: "Estadísticas de clics — misconciertos" },
      {
        name: "description",
        content:
          "Panel interno de misconciertos con las estadísticas de clics en 'Comprar entradas' por concierto.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const fetchStats = useServerFn(getClickStats);
  const [stats, setStats] = useState<ClickStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats()
      .then((res) => {
        setStats(res.stats);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [fetchStats]);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver al mapa
        </Link>

        <div className="mt-4 mb-6 flex items-center gap-3">
          <div className="rounded-full bg-primary/15 p-2">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Estadísticas de clics</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? "Cargando…" : `${total} clics totales en "Comprar entradas"`}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error === "Forbidden"
              ? "No tenés permisos de administrador para ver esta página."
              : error}
          </div>
        )}

        {!error && !loading && stats.length === 0 && (
          <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Todavía no hay clics registrados.
          </div>
        )}

        {!error && stats.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Concierto</th>
                  <th className="px-4 py-3 text-left">Venue</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Fuente</th>
                  <th className="px-4 py-3 text-right">Clics</th>
                  <th className="px-4 py-3 text-left">Último</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr key={`${s.concert_id}-${i}`} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{s.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.venue ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.date ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.source ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{s.clicks}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.last_click ? new Date(s.last_click).toLocaleString("es-AR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
