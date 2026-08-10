import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";

interface LegalLayoutProps {
  title: string;
  updatedAt: string;
  intro: ReactNode;
  children: ReactNode;
}

/** Marco común de las páginas legales (términos y privacidad). */
export function LegalLayout({ title, updatedAt, intro, children }: LegalLayoutProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al mapa
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última actualización: {updatedAt}</p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">{intro}</div>

        <div className="mt-8 space-y-8">{children}</div>

        <SiteFooter />
      </div>
    </main>
  );
}

interface LegalSectionProps {
  title: string;
  children: ReactNode;
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

export function LegalMail() {
  return (
    <a href="mailto:support@misconciertos.com.ar" className="text-primary hover:underline">
      support@misconciertos.com.ar
    </a>
  );
}
