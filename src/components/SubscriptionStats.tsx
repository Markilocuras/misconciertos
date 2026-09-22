import { Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { BellRing, CalendarClock, ChevronRight, Copy, Mail, Users } from "lucide-react";
import { toast } from "sonner";

import type { ResumenSuscripciones } from "@/lib/suscripciones.functions";

/** "2026-09-14T22:31:00Z" → "14 sep". */
function diaCorto(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

/** "2026-11-07" → "7 nov". La fecha del show ya viene sin hora. */
function fechaShow(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Las direcciones de un grupo, con el botón para copiarlas todas.
 *
 * Copia separadas por coma, que es lo que entiende el campo "Para" de
 * cualquier cliente de mail: el caso real de abrir esta lista es escribirle a
 * esta gente, y copiar de a una es justo lo que no se quiere hacer.
 */
function ListaDeMails({ emails, nota }: { emails: string[]; nota?: string }) {
  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(`${emails.length} ${emails.length === 1 ? "mail copiado" : "mails copiados"}`);
    } catch {
      // Pasa sin https o sin permiso del navegador. Decirlo es mejor que un
      // botón que no hace nada: la lista está a la vista para copiar a mano.
      toast.error("El navegador no dejó copiar");
    }
  }, [emails]);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <ul className="min-w-0 space-y-1">
          {emails.map((email) => (
            <li key={email} className="break-all font-mono text-xs text-foreground/90">
              {email}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <Copy className="h-3 w-3" aria-hidden="true" /> Copiar
        </button>
      </div>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  children,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

/**
 * Quién dejó su mail y para qué.
 *
 * Las tres listas se muestran separadas porque prometen cosas distintas: el
 * resumen diario sale siempre, el aviso por artista sale cuando ese artista
 * anuncia algo, y el recordatorio de show sale una sola vez y después esa fila
 * ya no espera nada. Un total único taparía esa diferencia, que es justo lo que
 * hay que mirar para saber si vale la pena seguir mandando cada uno.
 *
 * Cada fila se abre y muestra las direcciones. Se pueden abrir varias a la vez
 * a propósito: comparar dos listas es media razón para venir a mirarlas.
 */
export function SubscriptionStats({ resumen }: { resumen: ResumenSuscripciones }) {
  const { personas, suscripciones, digest, artistas, shows } = resumen;
  const pendientes = shows.reduce((acc, s) => acc + (s.emails.length - s.avisados), 0);

  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const alternar = useCallback((clave: string) => {
    setAbiertos((prev) => {
      const siguiente = new Set(prev);
      if (!siguiente.delete(clave)) siguiente.add(clave);
      return siguiente;
    });
  }, []);

  if (suscripciones === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Todavía no dejó su mail nadie.
      </div>
    );
  }

  const sinConfirmar = digest.total - digest.emails.length;
  const digestAbierto = abiertos.has("digest");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={Users}
          label="Personas"
          value={personas}
          hint={`${suscripciones} ${suscripciones === 1 ? "suscripción" : "suscripciones"} en total`}
        />
        <Tile
          icon={Mail}
          label="Resumen diario"
          value={digest.total}
          hint={
            sinConfirmar === 0
              ? "todas con el mail confirmado"
              : `${digest.emails.length} con el mail confirmado (son las que reciben)`
          }
        >
          {/* El resumen diario no tiene tabla abajo —va a todos, no a un
              artista ni a un show—, así que su lista se abre acá. */}
          {digest.emails.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => alternar("digest")}
                aria-expanded={digestAbierto}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${digestAbierto ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
                {digestAbierto ? "Ocultar mails" : "Ver mails"}
              </button>
              {digestAbierto && (
                <div className="mt-3 border-t border-border pt-3">
                  <ListaDeMails
                    emails={digest.emails}
                    nota={
                      sinConfirmar > 0
                        ? `${sinConfirmar} sin confirmar no ${
                            sinConfirmar === 1 ? "figura" : "figuran"
                          }: a una cuenta sin verificar tampoco se le escribe.`
                        : undefined
                    }
                  />
                </div>
              )}
            </>
          )}
        </Tile>
        <Tile
          icon={BellRing}
          label="Avisos por artista"
          value={artistas.reduce((acc, a) => acc + a.emails.length, 0)}
          hint={`sobre ${artistas.length} ${artistas.length === 1 ? "artista" : "artistas"}`}
        />
        <Tile
          icon={CalendarClock}
          label="Recordatorios de show"
          value={shows.reduce((acc, s) => acc + s.emails.length, 0)}
          hint={`${pendientes} sin avisar todavía · ${shows.length} ${shows.length === 1 ? "show" : "shows"}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tabla
          titulo="Avisos por artista"
          subtitulo="Le llega un mail cuando ese artista anuncia un show nuevo. Tocá una fila para ver quiénes son."
          vacia="Todavía no se anotó nadie a un artista."
          filas={artistas.length}
          encabezados={["Artista", "Personas", "Última"]}
        >
          {artistas.map((a) => (
            <Fila
              key={a.slug}
              abierta={abiertos.has(`artista:${a.slug}`)}
              onToggle={() => alternar(`artista:${a.slug}`)}
              nombre={a.artist}
              detalle={
                /* Dos grafías del mismo artista son una sola audiencia: el
                   cruce contra los conciertos nuevos es por slug. */
                a.variantes.length > 0 ? `también como ${a.variantes.join(", ")}` : null
              }
              cantidad={a.emails.length}
              ultimaColumna={diaCorto(a.ultima)}
              emails={a.emails}
            />
          ))}
        </Tabla>

        <Tabla
          titulo="Recordatorios de show"
          subtitulo="Le llega un mail el día anterior. Sale una vez y la suscripción se apaga."
          vacia="Todavía no se anotó nadie a un show."
          filas={shows.length}
          encabezados={["Show", "Personas", "Fecha"]}
        >
          {shows.map((s) => (
            <Fila
              key={s.concert_id}
              abierta={abiertos.has(`show:${s.concert_id}`)}
              onToggle={() => alternar(`show:${s.concert_id}`)}
              nombre={s.title}
              enlace={s.slug}
              detalle={`${s.venue ?? "—"}${
                s.avisados > 0 ? ` · ${s.avisados} ya avisado${s.avisados === 1 ? "" : "s"}` : ""
              }`}
              cantidad={s.emails.length}
              ultimaColumna={fechaShow(s.date)}
              emails={s.emails}
            />
          ))}
        </Tabla>
      </div>
    </div>
  );
}

/**
 * Una fila que se abre.
 *
 * El clic vale en toda la fila, que es donde la mano va, pero el que dispara es
 * un `<button>` de verdad en la primera celda: así el teclado y un lector de
 * pantalla la ven como lo que es. Por eso el botón corta la propagación — si
 * no, un clic ahí abriría y cerraría de una.
 */
function Fila({
  abierta,
  onToggle,
  nombre,
  enlace,
  detalle,
  cantidad,
  ultimaColumna,
  emails,
}: {
  abierta: boolean;
  onToggle: () => void;
  nombre: string;
  enlace?: string | null;
  detalle?: string | null;
  cantidad: number;
  ultimaColumna: string;
  emails: string[];
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-border transition hover:bg-muted/40 ${
          abierta ? "bg-muted/30" : ""
        }`}
      >
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={abierta}
            className="flex w-full items-start gap-1.5 text-left font-medium"
          >
            <ChevronRight
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                abierta ? "rotate-90" : ""
              }`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              {nombre}
              {detalle && (
                <span className="block text-xs font-normal text-muted-foreground">{detalle}</span>
              )}
            </span>
          </button>
        </td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums">{cantidad}</td>
        <td className="px-4 py-3 text-muted-foreground">{ultimaColumna}</td>
      </tr>
      {abierta && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={3} className="px-4 py-3 pl-9">
            <ListaDeMails emails={emails} />
            {/* El link a la ficha va acá adentro y no en el nombre: arriba, un
                ancla dentro de una fila clickeable serían dos acciones
                distintas en el mismo lugar. */}
            {enlace && (
              <Link
                to="/concierto/$slug"
                params={{ slug: enlace }}
                className="mt-2 inline-block text-xs text-primary hover:underline"
              >
                Ver la ficha del show →
              </Link>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Tabla({
  titulo,
  subtitulo,
  vacia,
  filas,
  encabezados,
  children,
}: {
  titulo: string;
  subtitulo: string;
  vacia: string;
  filas: number;
  encabezados: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{subtitulo}</p>
      </header>
      {filas === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vacia}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              {encabezados.map((h, i) => (
                <th key={h} className={`px-4 py-2 ${i === 1 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      )}
    </section>
  );
}
