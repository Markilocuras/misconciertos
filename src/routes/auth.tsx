import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Sobrevive al cambio de mode porque es la misma ruta: el componente no se
  // desmonta, así que el aviso queda a la vista en el formulario de login en
  // lugar de irse con el toast.
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

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
        if (!acceptedTerms) {
          toast.error("Tenés que aceptar los Términos y la Política de Privacidad.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Todavía no hay sesión (falta confirmar el mail), así que la
            // preferencia viaja acá y la materializa el trigger
            // on_auth_user_created_concert_digest.
            data: {
              username: username.trim(),
              notify_new_concerts: notify,
              // Constancia de cuándo aceptó los Términos, por si hay que
              // demostrar el consentimiento (Ley 25.326).
              terms_accepted_at: new Date().toISOString(),
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;

        if (data.session) {
          // El proyecto no está exigiendo confirmar el mail: la cuenta ya quedó
          // activa y con sesión, así que no tiene sentido mandar a revisar la
          // casilla ni a iniciar sesión de nuevo.
          toast.success("¡Cuenta creada! Ya estás dentro.");
          navigate({ to: "/" });
        } else {
          toast.success("Cuenta creada. Te mandamos un mail para confirmarla.");
          setPendingConfirmation(true);
          setPassword("");
          navigate({ to: "/auth", search: { mode: "login" } });
        }
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

        {pendingConfirmation && !isRegister && (
          <div
            role="status"
            className="mt-4 flex gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm"
          >
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Te mandamos un mail para confirmar tu cuenta.
              <span className="block text-xs text-muted-foreground">
                Abrilo, confirmá y volvé acá a iniciar sesión. Si no lo ves, revisá el spam.
              </span>
            </span>
          </div>
        )}

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
          {isRegister && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
              <Checkbox
                id="terms"
                checked={acceptedTerms}
                onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                className="mt-0.5"
              />
              <span>
                Acepto los{" "}
                <Link to="/terminos" target="_blank" className="text-primary hover:underline">
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link to="/privacidad" target="_blank" className="text-primary hover:underline">
                  Política de Privacidad
                </Link>
                .
              </span>
            </label>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || (isRegister && !acceptedTerms)}
          >
            {submitting ? "Procesando..." : isRegister ? "Crear cuenta" : "Entrar"}
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
