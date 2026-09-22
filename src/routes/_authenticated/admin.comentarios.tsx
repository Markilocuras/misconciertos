import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MessagesSquare, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { listComments, moderateComment, type ComentarioModerable } from "@/lib/comments.functions";

export const Route = createFileRoute("/_authenticated/admin/comentarios")({
  head: () => ({
    meta: [
      { title: "Comentarios — misconciertos" },
      {
        name: "description",
        content: "Panel interno de misconciertos para moderar los comentarios de artista.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ComentariosPage,
});

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ComentariosPage() {
  const fetchComentarios = useServerFn(listComments);
  const moderar = useServerFn(moderateComment);

  const [comentarios, setComentarios] = useState<ComentarioModerable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Por fila, para que el botón que tocaste sea el que se bloquea.
  const [moderando, setModerando] = useState<string | null>(null);

  useEffect(() => {
    fetchComentarios()
      .then((res) => setComentarios(res.comentarios))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [fetchComentarios]);

  const decidir = useCallback(
    async (c: ComentarioModerable, accion: "eliminar" | "restaurar") => {
      setModerando(c.id);
      try {
        await moderar({ data: { id: c.id, accion } });
        // La fila se queda en la lista, cambiada de estado: eliminar es
        // reversible y el botón para deshacer tiene que estar donde estabas
        // mirando, no atrás de recargar la página.
        setComentarios((prev) =>
          prev.map((p) =>
            p.id === c.id
              ? { ...p, deleted_at: accion === "eliminar" ? new Date().toISOString() : null }
              : p,
          ),
        );
        toast.success(
          accion === "eliminar" ? "Eliminado, ya no se ve en la ficha" : "Vuelve a estar visible",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar");
      } finally {
        setModerando(null);
      }
    },
    [moderar],
  );

  const eliminados = comentarios.filter((c) => c.deleted_at).length;

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
          <MessagesSquare className="h-6 w-6 text-primary" />
          Comentarios
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Todo lo que publicó la gente en las fichas de artista, lo último primero. Eliminar lo saca
          de la ficha en el acto y para todos; la fila se queda acá, marcada, así un clic de más se
          deshace y se ve quién viene subiendo cosas que hay que sacar.
        </p>

        {loading && <p className="mt-8 text-sm text-muted-foreground">Cargando…</p>}
        {error && (
          <p className="mt-8 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </p>
        )}

        {!loading && !error && comentarios.length === 0 && (
          <p className="mt-8 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Todavía no comentó nadie.
          </p>
        )}

        {!loading && !error && comentarios.length > 0 && (
          <p className="mt-6 text-xs text-muted-foreground">
            {comentarios.length} {comentarios.length === 1 ? "comentario" : "comentarios"}
            {eliminados > 0 && ` · ${eliminados} eliminado${eliminados === 1 ? "" : "s"}`}
          </p>
        )}

        <ul className="mt-3 space-y-3">
          {comentarios.map((c) => {
            const eliminado = Boolean(c.deleted_at);
            return (
              <li
                key={c.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start ${
                  eliminado ? "border-dashed border-border bg-muted/30" : "border-border bg-card"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-primary">{c.autor ?? "Usuario"}</span>
                    <span>sobre</span>
                    <span className="font-medium text-foreground">{c.artist}</span>
                    <span>·</span>
                    <span>{fechaHora(c.created_at)}</span>
                    {eliminado && (
                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
                        eliminado
                      </span>
                    )}
                  </p>
                  {/* El comentario es texto que escribió cualquiera: se muestra
                      entero y sin cortar, que es lo que hay que poder juzgar. */}
                  <p
                    className={`mt-2 whitespace-pre-wrap break-words text-sm ${
                      eliminado ? "text-muted-foreground line-through" : "text-foreground/90"
                    }`}
                  >
                    {c.body}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {eliminado ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={moderando === c.id}
                      onClick={() => decidir(c, "restaurar")}
                    >
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Restaurar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={moderando === c.id}
                      onClick={() => decidir(c, "eliminar")}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
