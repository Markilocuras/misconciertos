import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchUpcomingConcertRows } from "@/lib/concerts.functions";

const BASE_URL = "https://app.misconciertos.workers.dev";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().slice(0, 10);
        // Only public, indexable routes. /auth and /admin/* are noindex.
        const entries: SitemapEntry[] = [
          { path: "/", lastmod: today, changefreq: "daily", priority: "1.0" },
          { path: "/agenda", lastmod: today, changefreq: "daily", priority: "0.8" },
        ];

        const { concerts } = await fetchUpcomingConcertRows();
        for (const c of concerts) {
          if (!c.slug) continue;
          entries.push({
            path: `/concierto/${c.slug}`,
            lastmod: c.updated_at?.slice(0, 10),
            changefreq: "weekly",
            priority: "0.7",
          });
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
