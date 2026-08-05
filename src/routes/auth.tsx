import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { SITE_URL } from "@/lib/site";
import { toast } from "sonner";

type Mode = "login" | "register";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode === "register" ? "register" : "login") as Mode,
  }),
  head: () => ({
    meta: [
      { title: "Acceder — misconciertos" },
      {
        name: "description",
        content:
          "Iniciá sesión o creá tu cuenta en misconciertos para guardar recitales y comprar entradas en Buenos Aires.",
      },
      { property: "og:title", content: "Acceder — misconciertos" },
      {
        property: "og:description",
        content: "Iniciá sesión o registrate en misconciertos.",
      },
      { property: "og:url", content: `${SITE_URL}/auth` },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/auth` }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [notify, setNotify] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/" });
    });
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Todavía no hay sesión (falta confirmar el mail), así que la
            // preferencia viaja acá y la materializa el trigger
            // on_auth_user_created_concert_digest.
            data: { username: username.trim(), notify_new_concerts: notify },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Revisá tu email para confirmar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("¡Bienvenido!");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setSubmitting(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <img src="/logo.svg" alt="" className="h-6 w-6" />
          <span className="text-sm font-semibold">misconciertos</span>
        </Link>

        <h1 className="text-2xl font-bold tracking-tight">
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isRegister
            ? "Registrate para guardar y comprar entradas."
            : "Ingresá con tu email y contraseña."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isRegister && (
            <div className="space-y-2">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input
                id="username"
                type="text"
                required
                autoComplete="username"
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
                title="3-20 caracteres: letras, números y guión bajo."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {isRegister && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-accent/30 p-3 text-sm">
              <Checkbox
                checked={notify}
                onCheckedChange={(checked) => setNotify(checked === true)}
                className="mt-0.5"
              />
              <span>
                Avisame por mail cuando haya recitales nuevos
                <span className="block text-xs text-muted-foreground">
                  Un solo mail con los shows que se suman. Lo podés apagar cuando quieras.
                </span>
              </span>
            </label>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? "Procesando..."
              : isRegister
                ? "Crear cuenta"
                : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isRegister ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"}{" "}
          <Link
            to="/auth"
            search={{ mode: isRegister ? "login" : "register" }}
            className="font-medium text-primary hover:underline"
          >
            {isRegister ? "Iniciar sesión" : "Registrate"}
          </Link>
        </p>
      </div>
    </main>
  );
}
