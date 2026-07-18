import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Heart, MapPin, MessageCircle, User as UserIcon, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatConcertDate, FALLBACK_IMAGES } from "@/data/concerts";
import { toast } from "sonner";

type SavedRow = {
  id: string;
  concerts: {
    title: string;
    artist: string | null;
    venue: string | null;
    date: string | null;
    time: string | null;
    price: string | null;
    image_url: string | null;
    slug: string | null;
  } | null;
};

type CommentRow = {
  id: string;
  artist: string;
  body: string;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil — misconciertos" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
      supabase
        .from("saved_concerts")
        .select(
          "id, concerts(title, artist, venue, date, time, price, image_url, slug)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("artist_comments")
        .select("id, artist, body, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]).then(([profileRes, savedRes, commentsRes]) => {
      if (cancelled) return;
      setUsername(profileRes.data?.username ?? null);
      setSaved((savedRes.data ?? []) as SavedRow[]);
      setComments((commentsRes.data ?? []) as CommentRow[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const unsave = async (rowId: string) => {
    const { error } = await supabase.from("saved_concerts").delete().eq("id", rowId);
    if (error) {
      toast.error("No se pudo quitar, probá de nuevo");
      return;
    }
    setSaved((prev) => prev.filter((r) => r.id !== rowId));
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al mapa
        </Link>

        <div className="mt-4 mb-6 flex items-center gap-3">
          <div className="rounded-full bg-primary/15 p-2">
            <UserIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{username ?? "Mi perfil"}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
            <Heart className="h-4 w-4" /> Conciertos guardados
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : saved.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Todavía no guardaste ningún concierto.{" "}
              <Link to="/" className="text-primary hover:underline">
                Explorá el mapa
              </Link>{" "}
              y tocá "Guardar" en los que te interesen.
            </p>
          ) : (
            <ul className="space-y-2">
              {saved.map((row) => {
                const c = row.concerts;
                if (!c) return null;
                const inner = (
                  <>
                    <img
                      src={c.image_url ?? FALLBACK_IMAGES[0]}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.artist || c.title}</p>
                      <p className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {c.venue}
                        </span>
                        {c.date && <span className="capitalize">{formatConcertDate(c.date)}</span>}
                        {c.time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {c.time} hs
                          </span>
                        )}
                      </p>
                    </div>
                  </>
                );
                return (
                  <li key={row.id} className="flex items-center gap-2">
                    {c.slug ? (
                      <Link
                        to="/concierto/$slug"
                        params={{ slug: c.slug }}
                        className="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-border bg-card p-3">
                        {inner}
                      </div>
                    )}
                    <button
                      onClick={() => unsave(row.id)}
                      className="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      aria-label="Quitar de guardados"
                      title="Quitar de guardados"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
            <MessageCircle className="h-4 w-4" /> Mis comentarios
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : comments.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Todavía no comentaste en ningún artista.
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-accent/30 p-3 text-sm">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-primary">{c.artist}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </p>
                  <p className="mt-1 text-foreground/90">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
