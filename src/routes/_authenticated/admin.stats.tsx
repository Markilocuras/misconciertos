import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getClickStats, type ClickPoint, type ClickStat } from "@/lib/stats.functions";
import { getSubscriptionStats, type ResumenSuscripciones } from "@/lib/suscripciones.functions";
import { ClickCharts } from "@/components/ClickCharts";
import { SubscriptionStats } from "@/components/SubscriptionStats";
import { ArrowLeft, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/stats")({
  head: () => ({
    meta: [
      { title: "Estadísticas — misconciertos" },
      {
        name: "description",
        content:
          "Panel interno de misconciertos con los clics en 'Comprar entradas' y las suscripciones por mail.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const fetchStats = useServerFn(getClickStats);
  const fetchSuscripciones = useServerFn(getSubscriptionStats);

  const [stats, setStats] = useState<ClickStat[]>([]);
  const [series, setSeries] = useState<ClickPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [resumen, setResumen] = useState<ResumenSuscripciones | null>(null);
  const [loadingSuscripciones, setLoadingSuscripciones] = useState(true);

  // Las dos consultas van por separado: si una se rompe, la otra igual se ve.
  // Los mensajes se muestran una sola vez porque el caso más probable es el que
  // las voltea a las dos juntas —no ser admin—, y repetirlo no informa nada.
  const [errores, setErrores] = useState<string[]>([]);
  const agregarError = useCallback((err: unknown) => {
    const mensaje = err instanceof Error ? err.message : String(err);
    setErrores((prev) => (prev.includes(mensaje) ? prev : [...prev, mensaje]));
  }, []);

  useEffect(() => {
    fetchStats()
      .then((res) => {
        setStats(res.stats);
        setSeries(res.series);
        setTotal(res.total);
      })
      .catch(agregarError)
      .finally(() => setLoading(false));
  }, [fetchStats, agregarError]);

  useEffect(() => {
    fetchSuscripciones()
      .then(setResumen)
      .catch(agregarError)
      .finally(() => setLoadingSuscripciones(false));
  }, [fetchSuscripciones, agregarError]);

  const cargando = loading || loadingSuscripciones;
  const resumenTexto = [
    loading ? null : `${total} clics en "Comprar entradas"`,
    loadingSuscripciones || !resumen
      ? null
      : `${resumen.personas} ${resumen.personas === 1 ? "persona suscripta" : "personas suscriptas"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al mapa
        </Link>

        <div className="mt-4 mb-6 flex items-center gap-3">
          <div className="rounded-full bg-primary/15 p-2">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Estadísticas</h1>
            <p className="text-sm text-muted-foreground">
              {cargando && !resumenTexto ? "Cargando…" : resumenTexto}
            </p>
          </div>
        </div>

        {errores.length > 0 && (
          <div className="mb-6 space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errores.map((e) => (
              <p key={e}>
                {e === "Forbidden" ? "No tenés permisos de administrador para ver esta página." : e}
              </p>
            ))}
          </div>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Suscripciones por mail</h2>
          {loadingSuscripciones ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            resumen && <SubscriptionStats resumen={resumen} />
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Clics en “Comprar entradas”</h2>

          {!loading && stats.length === 0 && (
            <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Todavía no hay clics registrados.
            </div>
          )}

          {stats.length > 0 && (
            <>
              <div className="mb-6">
                <ClickCharts series={series} total={total} />
              </div>

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
            </>
          )}
        </section>
      </div>
    </main>
  );
}
