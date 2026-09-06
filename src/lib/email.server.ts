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
      firstError ??= err instanceof Error ? err.message : String(err);
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

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1a1a24">
    <h2 style="font-size:18px;margin:0 0 4px">Una fuente de conciertos dejó de traer datos</h2>
    <p style="color:#666;font-size:14px;margin:0 0 16px">Corrida de la ingesta en ${escapeHtml(SITE_URL)}</p>
    <ul style="font-size:15px;padding-left:20px;margin:0 0 20px">${filas}</ul>
    <p style="font-size:14px;line-height:1.5;color:#333">
      Cuando una fuente responde bien pero no devuelve eventos, casi siempre cambió su HTML
      y el parser dejó de matchear. Para ver qué está llegando:
    </p>
    <pre style="background:#f4f4f6;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto">POST ${escapeHtml(SITE_URL)}/api/public/hooks/ingest-concerts?debug=1</pre>
    <p style="font-size:13px;color:#888">Ese modo parsea todo y devuelve una muestra, sin escribir en la base.</p>
  </div>`;
}

function alertaTexto(fuentes: FuenteCaida[]): string {
  const filas = fuentes
    .map(
      (f) =>
        `- ${f.source}: ${f.error ? `falló con: ${f.error}` : "respondió bien pero el parser no encontró ningún evento"}`,
    )
    .join("\n");
  return [
    "Una fuente de conciertos dejó de traer datos.",
    "",
    filas,
    "",
    "Cuando una fuente responde bien pero no devuelve eventos, casi siempre cambió su HTML.",
    `Para ver qué está llegando: POST ${SITE_URL}/api/public/hooks/ingest-concerts?debug=1`,
    "(ese modo parsea todo y devuelve una muestra, sin escribir en la base)",
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
        subject: `misconciertos — sin datos de ${nombres}`,
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
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
