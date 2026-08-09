// Google Analytics 4. El Measurement ID no es un secreto — viaja en el HTML de
// todas las páginas — así que vive acá como constante en vez de en .env: los
// deploys son manuales y Vite resuelve import.meta.env en build time, con lo
// cual un .env incompleto dejaría el bundle sin tag y sin ningún aviso.
export const GA_MEASUREMENT_ID = "G-HCCTE5TBHJ";

// Solo medimos producción: en `vite dev` y en `build:dev` el tag no se emite,
// así que navegar local no ensucia los informes.
export const GA_ENABLED = import.meta.env.PROD;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// gtag.js + bootstrap del dataLayer, para el `headScripts` de la ruta raíz.
// `send_page_view: false` porque la app navega client-side: los page_view los
// emite useAnalytics() y así la primera vista no se cuenta dos veces.
export const GA_HEAD_SCRIPTS = GA_ENABLED
  ? [
      {
        src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
        async: true,
      },
      {
        children:
          `window.dataLayer=window.dataLayer||[];` +
          `function gtag(){dataLayer.push(arguments);}` +
          `gtag('js',new Date());` +
          `gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});`,
      },
    ]
  : [];

export function trackPageView(path: string) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", name, params);
}
