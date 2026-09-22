import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  // `avisos` llega en true desde la tarjeta que invita a registrarse en el
  // mapa, que ofrece los mails de conciertos nuevos, y deja tildada la casilla.
  // Si arrancara apagada esa tarjeta prometería algo que no pasa: el trigger
  // que suscribe al digest solo corre cuando el alta viaja con
  // notify_new_concerts en true.
  //
  // Va opcional y solo se emite cuando es true, por dos motivos: así los Link a
  // /auth que hay repartidos por la app no tienen que pasarlo, y la URL no se
  // ensucia con un `avisos=false` que no significa nada.
  validateSearch: (search: Record<string, unknown>): { mode: Mode; avisos?: true } => {
    const avisos = search.avisos === true || search.avisos === "1" || search.avisos === "true";
    return {
      mode: (search.mode === "register" ? "register" : "login") as Mode,
      ...(avisos ? { avisos: true as const } : {}),
    };
  },
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

// A dónde vuelve el visitante desde el link del mail. Es el mapa, no /auth:
// confirmar es un trámite y la recompensa es la app, no otro formulario. Sale
// del origin y no de SITE_URL para que en desarrollo el link apunte a
// localhost; en producción el host de workers.dev ya llega acá redirigido con
// un 301 desde `src/server.ts`, así que el origin siempre es el canónico.
//
// Ojo: esta URL tiene que estar en la allowlist de Redirect URLs de Supabase.
// Si no está, Auth no avisa nada: manda al Site URL del proyecto y listo.
const urlDeVuelta = () => `${window.location.origin}/`;

// Los mensajes de supabase-auth vienen en inglés y describen la API, no lo que
// le pasó a la persona. Traducimos los que se ven seguido y dejamos pasar el
// resto crudo, que es mejor que un "algo salió mal" para algo raro.
function mensajeDeError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const crudo = err instanceof Error ? err.message : "";

  if (code === "invalid_credentials" || /invalid login credentials/i.test(crudo))
    return "Mail o contraseña incorrectos.";
  if (code === "user_already_exists" || /already registered/i.test(crudo))
    return "Ya existe una cuenta con ese mail. Probá iniciar sesión.";
  if (code === "weak_password" || /password should be/i.test(crudo))
    return "La contraseña tiene que tener al menos 6 caracteres.";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(crudo))
    return "Mandamos demasiados mails seguidos. Esperá un minuto y probá de nuevo.";
  return crudo || "Algo salió mal";
}

// Entrar con una cuenta sin confirmar no es un error de credenciales: es el
// mismo estado de "te mandamos un mail" al que llega recién registrado, y hay
// que llevarlo ahí en vez de rebotarlo con un cartel rojo en inglés.
function esMailSinConfirmar(err: unknown): boolean {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const crudo = err instanceof Error ? err.message : "";
  return code === "email_not_confirmed" || /email not confirmed/i.test(crudo);
}

// Lo que Supabase deja pasar entre dos mails de confirmación al mismo destino.
const ESPERA_REENVIO = 60;

function AuthPage() {
  const { mode, avisos } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [notify, setNotify] = useState(avisos ?? false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // El mail al que salió la confirmación, o null si no hay ninguna pendiente.
  // Guardamos la dirección y no un booleano porque el aviso la muestra: "te
  // mandamos un mail" sin decir a dónde no deja ver el error de tipeo, que es
  // justo la razón más común de que el mail no llegue.
  const [confirmarMail, setConfirmarMail] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [esperaReenvio, setEsperaReenvio] = useState(0);

  useEffect(() => {
    // `onAuthStateChange` y no un `getSession` suelto: supabase-js sincroniza la
    // sesión entre pestañas del mismo navegador, así que confirmar el mail en la
    // pestaña que abrió el link también saca a esta de la pantalla de espera.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (session) navigate({ to: "/" });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Cuenta regresiva del botón de reenviar. Existe porque Supabase rechaza el
  // segundo mail al mismo destino dentro del minuto: sin el contador, el botón
  // invita a apretarlo y devuelve un error que parece nuestro.
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const id = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [esperaReenvio]);

  const reenviarConfirmacion = async () => {
    if (!confirmarMail || reenviando || esperaReenvio > 0) return;
    setReenviando(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: confirmarMail,
        options: { emailRedirectTo: urlDeVuelta() },
      });
      if (error) throw error;
      toast.success("Te lo mandamos de nuevo.");
      setEsperaReenvio(ESPERA_REENVIO);
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setReenviando(false);
    }
  };

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
            emailRedirectTo: urlDeVuelta(),
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
          // Acá la cuenta existe pero no sirve para nada hasta que abra el mail,
          // y eso no se puede decir con un toast: se va solo a los segundos y
          // deja al visitante mirando un formulario de login que va a rebotarlo.
          // La pantalla se queda hasta que confirme.
          setPassword("");
          setConfirmarMail(email);
          setEsperaReenvio(ESPERA_REENVIO);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          if (esMailSinConfirmar(error)) {
            setPassword("");
            setConfirmarMail(email);
            return;
          }
          throw error;
        }
        toast.success("¡Bienvenido!");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isRegister = mode === "register";

  if (confirmarMail) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Revisá tu correo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Le mandamos un mail a{" "}
            <span className="font-medium break-all text-foreground">{confirmarMail}</span> con un
            link para confirmar la cuenta. Abrilo y volvés derecho al mapa.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Si no lo ves, mirá en spam o en promociones. Puede tardar un par de minutos.
          </p>

          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={reenviarConfirmacion}
            disabled={reenviando || esperaReenvio > 0}
          >
            {reenviando
              ? "Enviando..."
              : esperaReenvio > 0
                ? `Reenviar el mail (${esperaReenvio}s)`
                : "Reenviar el mail"}
          </Button>

          <button
            type="button"
            className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
            onClick={() => {
              setConfirmarMail(null);
              navigate({ to: "/auth", search: { mode: "login" } });
            }}
          >
            Ya lo confirmé, quiero iniciar sesión
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
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
    </AuthShell>
  );
}

// La caja centrada con la marca arriba. La comparten el formulario y la
// pantalla de "revisá tu correo", que es la misma página en otro estado.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <img src="/logo.svg" alt="" className="h-6 w-6" />
          <span className="text-sm font-semibold">misconciertos</span>
        </Link>
        {children}
      </div>
    </main>
  );
}
