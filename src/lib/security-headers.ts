// Headers de seguridad aplicados a toda respuesta, tanto en el Worker de
// producción (src/server.ts) como en el camino dev (src/start.ts).
// CSP queda pendiente a propósito: los scripts inline de hidratación de
// TanStack Start requieren nonces para una CSP estricta.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};

export function applySecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) {
      try {
        response.headers.set(name, value);
      } catch {
        // Respuestas inmutables (p.ej. redirects internos): las devolvemos como están.
        return response;
      }
    }
  }
  return response;
}
