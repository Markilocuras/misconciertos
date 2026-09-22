import { Link } from "@tanstack/react-router";
import { BellRing, CalendarClock, Mail, Users } from "lucide-react";

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

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
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
 */
export function SubscriptionStats({ resumen }: { resumen: ResumenSuscripciones }) {
  const { personas, suscripciones, digest, artistas, shows } = resumen;
  const pendientes = shows.reduce((acc, s) => acc + (s.personas - s.avisados), 0);

  if (suscripciones === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Todavía no dejó su mail nadie.
      </div>
    );
  }

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
            digest.total === digest.confirmadas
              ? "todas con el mail confirmado"
              : `${digest.confirmadas} con el mail confirmado (son las que reciben)`
          }
        />
        <Tile
          icon={BellRing}
          label="Avisos por artista"
          value={artistas.reduce((acc, a) => acc + a.personas, 0)}
          hint={`sobre ${artistas.length} ${artistas.length === 1 ? "artista" : "artistas"}`}
        />
        <Tile
          icon={CalendarClock}
          label="Recordatorios de show"
          value={shows.reduce((acc, s) => acc + s.personas, 0)}
          hint={`${pendientes} sin avisar todavía · ${shows.length} ${shows.length === 1 ? "show" : "shows"}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tabla
          titulo="Avisos por artista"
          subtitulo="Le llega un mail cuando ese artista anuncia un show nuevo."
          vacia="Todavía no se anotó nadie a un artista."
          filas={artistas.length}
          encabezados={["Artista", "Personas", "Última"]}
        >
          {artistas.map((a) => (
            <tr key={a.slug} className="border-t border-border">
              <td className="px-4 py-3 font-medium">
                {a.artist}
                {/* Dos grafías del mismo artista son una sola audiencia: el
                    cruce contra los conciertos nuevos es por slug. */}
                {a.variantes.length > 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    también como {a.variantes.join(", ")}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{a.personas}</td>
              <td className="px-4 py-3 text-muted-foreground">{diaCorto(a.ultima)}</td>
            </tr>
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
            <tr key={s.concert_id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">
                {s.slug ? (
                  <Link
                    to="/concierto/$slug"
                    params={{ slug: s.slug }}
                    className="hover:text-primary hover:underline"
                  >
                    {s.title}
                  </Link>
                ) : (
                  s.title
                )}
                <span className="block text-xs font-normal text-muted-foreground">
                  {s.venue ?? "—"}
                  {s.avisados > 0 && ` · ${s.avisados} ya avisado${s.avisados === 1 ? "" : "s"}`}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{s.personas}</td>
              <td className="px-4 py-3 text-muted-foreground">{fechaShow(s.date)}</td>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
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
