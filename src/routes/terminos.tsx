import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, LegalList, LegalMail, LegalSection } from "@/components/LegalLayout";
import { SITE_URL } from "@/lib/site";

const TITLE = "Términos y Condiciones — misconciertos";
const DESCRIPTION =
  "Términos y Condiciones de misconciertos: qué es la plataforma, cuentas de usuario, uso permitido y limitación de responsabilidad.";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/terminos` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/terminos` }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalLayout
      title="Términos y Condiciones"
      updatedAt="9 de agosto de 2026"
      intro={
        <p>
          Bienvenido/a a misconciertos (misconciertos.com.ar). Al usar este sitio, aceptás los
          siguientes Términos y Condiciones. Si no estás de acuerdo, te pedimos que no uses la
          plataforma.
        </p>
      }
    >
      <LegalSection title="1. Qué es misconciertos">
        <p>
          misconciertos es un mapa y agenda interactiva de conciertos y recitales en Buenos Aires.
          Recopilamos y mostramos información pública sobre shows (artista, fecha, venue) y te
          redirigimos a plataformas de venta de entradas de terceros para completar tu compra.
        </p>
      </LegalSection>

      <LegalSection title="2. No somos un punto de venta">
        <p>
          misconciertos no vende entradas ni procesa pagos. Actuamos como intermediario informativo:
          te mostramos la información del show y te llevamos al sitio del vendedor oficial (por
          ejemplo, AllAccess) para que completes tu compra ahí. No somos responsables por la
          disponibilidad de entradas, los precios, la validez de las mismas, ni por ningún
          inconveniente derivado de la compra, que se rige exclusivamente por los términos del
          vendedor correspondiente.
        </p>
      </LegalSection>

      <LegalSection title="3. Cuentas de usuario">
        <p>
          Para comentar, guardar shows o activar alertas necesitás crear una cuenta. Sos responsable
          de mantener la confidencialidad de tus credenciales y de toda actividad realizada desde tu
          cuenta. La información que nos proporciones debe ser verídica y estar actualizada.
        </p>
      </LegalSection>

      <LegalSection title="4. Uso permitido">
        <p>Te pedimos que uses el sitio de buena fe. Está prohibido:</p>
        <LegalList>
          <li>Usar el sitio con fines ilegales o fraudulentos</li>
          <li>
            Publicar comentarios ofensivos, discriminatorios o que infrinjan derechos de terceros
          </li>
          <li>Extraer masivamente los datos del sitio (scraping) sin autorización</li>
          <li>Interferir con el funcionamiento normal de la plataforma</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="5. Propiedad intelectual">
        <p>
          El diseño, la marca &ldquo;misconciertos&rdquo; y el desarrollo del sitio son de nuestra
          propiedad. La información de los shows (nombres de artistas, imágenes promocionales)
          pertenece a sus respectivos titulares y se muestra con fines informativos.
        </p>
      </LegalSection>

      <LegalSection title="6. Publicidad y analítica">
        <p>
          Usamos Google Analytics y Google Ads para entender el uso del sitio y mostrar publicidad
          relevante, según se detalla en nuestra{" "}
          <Link to="/privacidad" className="text-primary hover:underline">
            Política de Privacidad
          </Link>
          . Al usar el sitio, aceptás ese tratamiento de datos en los términos allí descriptos.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitación de responsabilidad">
        <p>
          El sitio se ofrece &ldquo;tal cual&rdquo;. No garantizamos que la información esté siempre
          actualizada o libre de errores, aunque hacemos nuestro mejor esfuerzo para mantenerla
          precisa. No nos responsabilizamos por daños derivados del uso del sitio o de la compra de
          entradas en plataformas de terceros.
        </p>
      </LegalSection>

      <LegalSection title="8. Modificaciones">
        <p>
          Podemos modificar estos Términos en cualquier momento. Los cambios se publicarán en esta
          página con la fecha de actualización correspondiente. El uso continuado del sitio implica
          la aceptación de los cambios.
        </p>
      </LegalSection>

      <LegalSection title="9. Ley aplicable">
        <p>
          Estos Términos se rigen por las leyes de la República Argentina. Cualquier disputa se
          someterá a los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.
        </p>
      </LegalSection>

      <LegalSection title="10. Contacto">
        <p>
          Para consultas sobre estos Términos, escribinos a <LegalMail />.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
