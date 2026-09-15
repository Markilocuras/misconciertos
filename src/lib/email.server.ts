import { describeError } from "@/lib/describe-error";
import { SITE_URL } from "@/lib/site";

// Envío de mails vía Resend. Server-only: la API key vive en los secrets del
// Worker, nunca en el bundle del cliente.
const RESEND_BATCH_ENDPOINT = "https://api.resend.com/emails/batch";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM = "misconciertos <avisos@misconciertos.com.ar>";

// Límite de la API de Resend para /emails/batch.
const MAX_PER_BATCH = 100;
// Un resumen con 200 shows no lo lee nadie y hace pesado el mail.
const MAX_CONCERTS_LISTED = 25;

export type DigestConcert = {
  title: string;
  artist: string | null;
  venue: string | null;
  date: string | null;
  time: string | null;
  slug: string | null;
};

export type DigestRecipient = { email: string; unsubscribe_token: string };

// Los datos vienen de scraping: todo escapado antes de entrar al HTML del mail.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

function concertLine(c: DigestConcert): { title: string; detail: string; url: string } {
  const detail = [c.venue, formatDate(c.date), c.time ? `${c.time} hs` : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    title: c.artist || c.title,
    detail,
    url: c.slug ? `${SITE_URL}/concierto/${c.slug}` : SITE_URL,
  };
}

function subjectFor(count: number): string {
  return count === 1
    ? "1 recital nuevo en Buenos Aires"
    : `${count} recitales nuevos en Buenos Aires`;
}

function buildHtml(concerts: DigestConcert[], unsubscribeUrl: string): string {
  const listed = concerts.slice(0, MAX_CONCERTS_LISTED);
  const rest = concerts.length - listed.length;

  const items = listed
    .map((c) => {
      const { title, detail, url } = concertLine(c);
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e7e5e0">
        <a href="${escapeHtml(url)}" style="color:#0e111b;font-size:16px;font-weight:600;text-decoration:none">${escapeHtml(title)}</a>
        <div style="color:#6b6b76;font-size:14px;margin-top:4px">${escapeHtml(detail)}</div>
      </td></tr>`;
    })
    .join("");

  const more =
    rest > 0 ? `<p style="color:#6b6b76;font-size:14px">Y ${rest} más en el mapa.</p>` : "";

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f5f4ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <tr><td>
      <p style="margin:0 0 4px;color:#ff9710;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">misconciertos</p>
      <h1 style="margin:0 0 20px;font-size:22px;color:#0e111b">${escapeHtml(subjectFor(concerts.length))}</h1>
      <table role="presentation" style="width:100%;border-collapse:collapse">${items}</table>
      ${more}
      <p style="margin:24px 0 0">
        <a href="${SITE_URL}" style="display:inline-block;background:#ff9710;color:#0e111b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px">Ver el mapa de recitales</a>
      </p>
      <p style="margin:28px 0 0;color:#9a9aa5;font-size:12px;line-height:1.6">
        Recibís este mail porque activaste los avisos de recitales nuevos en misconciertos.<br>
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b6b76">Darme de baja</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function buildText(concerts: DigestConcert[], unsubscribeUrl: string): string {
  const listed = concerts.slice(0, MAX_CONCERTS_LISTED);
  const lines = listed.map((c) => {
    const { title, detail, url } = concertLine(c);
    return `- ${title}${detail ? ` (${detail})` : ""}\n  ${url}`;
  });
  const rest = concerts.length - listed.length;
  if (rest > 0) lines.push(`Y ${rest} más en ${SITE_URL}`);
  return [
    subjectFor(concerts.length),
    "",
    ...lines,
    "",
    `Para darte de baja: ${unsubscribeUrl}`,
  ].join("\n");
}

export type DigestResult = { sent: number; failed: number; error?: string };

// Nunca lanza: un problema mandando mails no debe voltear una corrida de
// ingesta que ya escribió los conciertos en la base.
export async function sendNewConcertsDigest(
  apiKey: string,
  concerts: DigestConcert[],
  recipients: DigestRecipient[],
): Promise<DigestResult> {
  if (concerts.length === 0 || recipients.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (let i = 0; i < recipients.length; i += MAX_PER_BATCH) {
    const chunk = recipients.slice(i, i + MAX_PER_BATCH);
    const payload = chunk.map((r) => {
      const unsubscribeUrl = `${SITE_URL}/baja?token=${encodeURIComponent(r.unsubscribe_token)}`;
      return {
        from: FROM,
        to: [r.email],
        subject: subjectFor(concerts.length),
        html: buildHtml(concerts, unsubscribeUrl),
        text: buildText(concerts, unsubscribeUrl),
        // Gmail y Outlook muestran su propio botón de baja con esto.
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      };
    });

    try {
      const res = await fetch(RESEND_BATCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        failed += chunk.length;
        const body = await res.text();
        firstError ??= `resend ${res.status}: ${body.slice(0, 200)}`;
        console.error("[email] resend batch failed", res.status, body.slice(0, 500));
        continue;
      }
      sent += chunk.length;
    } catch (err) {
      failed += chunk.length;
      firstError ??= describeError(err);
      console.error("[email] resend batch threw", err);
    }
  }

  return { sent, failed, ...(firstError ? { error: firstError } : {}) };
}

// ---------------------------------------------------------------------------
// Aviso de fuente caída
//
// Las fuentes se rompen calladas: cambian una clase del HTML, el parser deja de
// encontrar nada y la ingesta sigue devolviendo 200. Así ticketek estuvo un mes
// sin traer un solo show y allevents no aportó nunca una fila, y en los dos
// casos nos enteramos por casualidad, mirando por qué el mapa se sentía viejo.
// ---------------------------------------------------------------------------

export type FuenteCaida = {
  source: string;
  /** Ítems que el parser sacó del listado. Cero es la señal de que se rompió. */
  found: number;
  error?: string;
};

export type AlertResult = { sent: boolean; error?: string };

function alertaHtml(fuentes: FuenteCaida[]): string {
  const filas = fuentes
    .map((f) => {
      const motivo = f.error
        ? `falló con: ${escapeHtml(f.error)}`
        : "respondió bien pero el parser no encontró ningún evento";
      return `<li style="margin-bottom:10px"><strong>${escapeHtml(f.source)}</strong> — ${motivo}</li>`;
    })
    .join("");

  // El consejo depende de cómo falló, y antes no: el mail mandaba siempre a
  // `?debug=1`, que para una fuente que tiró error es el peor lugar posible.
  // Ese modo saltea la escritura en la base a propósito, así que si la corrida
  // se cayó justo ahí, debug vuelve verde y uno concluye que no pasaba nada.
  const hayVacias = fuentes.some((f) => !f.error);
  const hayErrores = fuentes.some((f) => f.error);

  const consejoVacias = `<p style="font-size:14px;line-height:1.5;color:#333">
      Una fuente que respondió bien pero no devolvió eventos casi siempre cambió su HTML
      y el parser dejó de matchear. Para ver qué está llegando:
    </p>
    <pre style="background:#f4f4f6;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto">POST ${escapeHtml(SITE_URL)}/api/public/hooks/ingest-concerts?debug=1</pre>
    <p style="font-size:13px;color:#888">Ese modo parsea todo y devuelve una muestra, sin escribir en la base.</p>`;

  const consejoErrores = `<p style="font-size:14px;line-height:1.5;color:#333">
      Una fuente que cortó con error no llegó a terminar la corrida, y el mensaje de arriba es
      todo lo que quedó: los logs del Worker no se guardan solos. Para ver el próximo entero,
      dejá esto corriendo y disparala a mano:
    </p>
    <pre style="background:#f4f4f6;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto">npx wrangler tail</pre>
    <p style="font-size:13px;color:#888">
      Ojo con <code>?debug=1</code> acá: saltea la escritura en la base, así que si la corrida se
      cayó ahí, debug va a volver verde igual.
    </p>`;

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1a1a24">
    <h2 style="font-size:18px;margin:0 0 4px">${hayErrores && !hayVacias ? "Falló una fuente de conciertos" : "Una fuente de conciertos dejó de traer datos"}</h2>
    <p style="color:#666;font-size:14px;margin:0 0 16px">Corrida de la ingesta en ${escapeHtml(SITE_URL)}</p>
    <ul style="font-size:15px;padding-left:20px;margin:0 0 20px">${filas}</ul>
    ${hayVacias ? consejoVacias : ""}
    ${hayErrores ? consejoErrores : ""}
  </div>`;
}

function alertaTexto(fuentes: FuenteCaida[]): string {
  const filas = fuentes
    .map(
      (f) =>
        `- ${f.source}: ${f.error ? `falló con: ${f.error}` : "respondió bien pero el parser no encontró ningún evento"}`,
    )
    .join("\n");
  const hayVacias = fuentes.some((f) => !f.error);
  const hayErrores = fuentes.some((f) => f.error);

  return [
    hayErrores && !hayVacias
      ? "Falló una fuente de conciertos."
      : "Una fuente de conciertos dejó de traer datos.",
    "",
    filas,
    ...(hayVacias
      ? [
          "",
          "Una fuente que responde bien pero no devuelve eventos casi siempre cambió su HTML.",
          `Para ver qué está llegando: POST ${SITE_URL}/api/public/hooks/ingest-concerts?debug=1`,
          "(ese modo parsea todo y devuelve una muestra, sin escribir en la base)",
        ]
      : []),
    ...(hayErrores
      ? [
          "",
          "Una fuente que cortó con error no terminó la corrida, y el mensaje de arriba es todo lo",
          "que quedó: los logs del Worker no se guardan solos. Para ver el próximo entero, dejá",
          "`npx wrangler tail` corriendo y disparala a mano.",
          "Ojo con ?debug=1 acá: saltea la escritura en la base, así que si la corrida se cayó ahí,",
          "debug va a volver verde igual.",
        ]
      : []),
  ].join("\n");
}

export async function sendIngestAlert(
  apiKey: string,
  to: string,
  fuentes: FuenteCaida[],
): Promise<AlertResult> {
  if (fuentes.length === 0) return { sent: false };

  const nombres = fuentes.map((f) => f.source).join(", ");
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        // El asunto es lo único que se ve sin abrir: que diga cuál de los dos
        // problemas es. "Sin datos" y "falló" se arreglan en lugares distintos.
        subject: fuentes.every((f) => f.error)
          ? `misconciertos — falló la ingesta de ${nombres}`
          : `misconciertos — sin datos de ${nombres}`,
        html: alertaHtml(fuentes),
        text: alertaTexto(fuentes),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] alerta de ingesta falló", res.status, body.slice(0, 500));
      return { sent: false, error: `resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] alerta de ingesta tiró", err);
    return { sent: false, error: describeError(err) };
  }
}

// ---------------------------------------------------------------------------
// Avisos por artista
//
// La ficha de cada artista ofrece "te vamos a avisar cuando {artista} anuncie
// un show nuevo". Durante meses eso no lo cumplió nadie: la gente se anotaba en
// artist_alerts y esa tabla no la leía ni una línea de código.
//
// Se manda un mail por persona, no uno por artista: alguien anotado en tres
// artistas que anuncian el mismo día recibe uno solo. El link de baja es por
// suscripción —artista + mail—, así que darse de baja de uno no te saca de los
// otros, que es lo que uno espera al anotarse por separado.
// ---------------------------------------------------------------------------

export type AlertaDeArtista = {
  email: string;
  unsubscribe_token: string;
  /** Qué artista disparó cada concierto, para poder decirlo en el mail. */
  conciertos: Array<{ artista: string; concierto: DigestConcert }>;
};

export type AlertasResult = { sent: number; failed: number; error?: string };

function asuntoAlerta(a: AlertaDeArtista): string {
  const artistas = [...new Set(a.conciertos.map((c) => c.artista))];
  if (artistas.length === 1) return `${artistas[0]} anunció un show`;
  return `${artistas.length} artistas que seguís anunciaron shows`;
}

function alertaHtmlArtista(a: AlertaDeArtista, unsubscribeUrl: string): string {
  const filas = a.conciertos
    .map(({ artista, concierto }) => {
      const { title, detail, url } = concertLine(concierto);
      return `<li style="margin-bottom:12px">
        <a href="${escapeHtml(url)}" style="color:#c2410c;font-weight:600;text-decoration:none">${escapeHtml(title)}</a>
        ${detail ? `<div style="color:#666;font-size:14px">${escapeHtml(detail)}</div>` : ""}
        <div style="color:#999;font-size:12px">Te anotaste para que te avisemos de ${escapeHtml(artista)}</div>
      </li>`;
    })
    .join("");

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1a1a24">
    <h2 style="font-size:18px;margin:0 0 16px">${escapeHtml(asuntoAlerta(a))}</h2>
    <ul style="font-size:15px;padding-left:20px;margin:0 0 20px">${filas}</ul>
    <p style="font-size:13px;color:#888">
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#888">Darme de baja de este aviso</a>
    </p>
  </div>`;
}

function alertaTextoArtista(a: AlertaDeArtista, unsubscribeUrl: string): string {
  const filas = a.conciertos.map(({ artista, concierto }) => {
    const { title, detail, url } = concertLine(concierto);
    return `- ${title}${detail ? ` (${detail})` : ""}\n  ${url}\n  te anotaste por ${artista}`;
  });
  return [asuntoAlerta(a), "", ...filas, "", `Para darte de baja: ${unsubscribeUrl}`].join("\n");
}

// Nunca lanza, por el mismo motivo que el digest: se llama después de escribir
// los conciertos y un problema con Resend no puede voltear una corrida.
export async function sendArtistAlerts(
  apiKey: string,
  alertas: AlertaDeArtista[],
): Promise<AlertasResult> {
  if (alertas.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (let i = 0; i < alertas.length; i += MAX_PER_BATCH) {
    const chunk = alertas.slice(i, i + MAX_PER_BATCH);
    const payload = chunk.map((a) => {
      const unsubscribeUrl = `${SITE_URL}/baja?tipo=artista&token=${encodeURIComponent(a.unsubscribe_token)}`;
      return {
        from: FROM,
        to: [a.email],
        subject: asuntoAlerta(a),
        html: alertaHtmlArtista(a, unsubscribeUrl),
        text: alertaTextoArtista(a, unsubscribeUrl),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      };
    });

    try {
      const res = await fetch(RESEND_BATCH_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        failed += chunk.length;
        const body = await res.text();
        firstError ??= `resend ${res.status}: ${body.slice(0, 200)}`;
        console.error("[email] alertas de artista fallaron", res.status, body.slice(0, 500));
        continue;
      }
      sent += chunk.length;
    } catch (err) {
      failed += chunk.length;
      firstError ??= describeError(err);
      console.error("[email] alertas de artista tiraron", err);
    }
  }

  return { sent, failed, ...(firstError ? { error: firstError } : {}) };
}
