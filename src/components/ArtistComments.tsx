import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  profiles: { username: string } | null;
};

export function ArtistComments({ artist }: { artist: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("artist_comments")
      .select("id, body, created_at, profiles(username)")
      .eq("artist", artist)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("[ArtistComments] load failed", error);
        setComments((data ?? []) as CommentRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artist]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !body.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("artist_comments")
      .insert({ artist, user_id: user.id, body: body.trim() })
      .select("id, body, created_at, profiles(username)")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("No se pudo publicar el comentario");
      return;
    }
    setComments((prev) => [data as CommentRow, ...prev]);
    setBody("");
  };

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4 text-primary" /> Comentarios sobre {artist}
      </h2>

      {user ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="¿Cómo estuvo el show?"
            maxLength={1000}
            required
          />
          <Button type="submit" size="sm" disabled={submitting || !body.trim()}>
            {submitting ? "Publicando..." : "Comentar"}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Link to="/auth" search={{ mode: "login" }} className="text-primary hover:underline">
            Iniciá sesión
          </Link>{" "}
          para dejar un comentario.
        </p>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando comentarios…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay comentarios.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-accent/30 p-3 text-sm">
              <p className="text-xs font-medium text-primary">{c.profiles?.username ?? "Usuario"}</p>
              <p className="mt-1 text-foreground/90">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
