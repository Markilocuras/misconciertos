import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, LegalList, LegalMail, LegalSection } from "@/components/LegalLayout";
import { SITE_URL } from "@/lib/site";

const TITLE = "Política de Privacidad — misconciertos";
const DESCRIPTION =
  "Política de Privacidad de misconciertos: qué datos recolectamos, para qué los usamos, con quién los compartimos y tus derechos según la Ley 25.326.";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/privacidad` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/privacidad` }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de Privacidad"
      updatedAt="9 de agosto de 2026"
      intro={
        <p>
          En misconciertos (&ldquo;nosotros&rdquo;, &ldquo;la plataforma&rdquo;) respetamos tu
          privacidad y nos comprometemos a proteger los datos personales que nos compartís al usar
          nuestro sitio (misconciertos.com.ar). Esta Política de Privacidad explica qué información
          recolectamos, cómo la usamos y qué derechos tenés al respecto, en cumplimiento de la Ley
          25.326 de Protección de Datos Personales de la República Argentina.
        </p>
      }
    >
      <LegalSection title="1. Qué datos recolectamos">
        <LegalList>
          <li>
            <strong className="font-medium text-foreground">Datos que nos das directamente:</strong>{" "}
            al crear una cuenta, comentar, guardar un show o activar una alerta, recolectamos tu
            email y, si lo proporcionás, tu nombre.
          </li>
          <li>
            <strong className="font-medium text-foreground">Datos de uso y navegación:</strong>{" "}
            información sobre cómo usás el sitio (páginas visitadas, tiempo de navegación, tipo de
            dispositivo, ubicación aproximada), recolectada automáticamente mediante cookies y
            herramientas de analítica.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              Datos de Google Analytics y Google Signals:
            </strong>{" "}
            usamos Google Analytics para entender cómo se usa el sitio. Si tenés la personalización
            de anuncios activada en tu cuenta de Google y la sesión iniciada, Google puede asociar
            tus datos de navegación en nuestro sitio con la información que ya tiene de tu cuenta,
            para darnos estadísticas más detalladas de audiencia (por ejemplo, datos demográficos
            agregados). Esto se conoce como &ldquo;Google Signals&rdquo; y depende de la
            configuración de privacidad de tu propia cuenta de Google.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              Datos proporcionados para publicidad (User-Provided Data):
            </strong>{" "}
            si esta función está activa, podemos enviar a Google, de forma cifrada (hash), datos de
            contacto como tu email, para mejorar la medición de conversiones y la relevancia de la
            publicidad en Google Ads. Nunca enviamos esta información sin cifrar, y no la usamos
            para ninguna categoría sensible.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="2. Para qué usamos tus datos">
        <LegalList>
          <li>Mostrar y personalizar el contenido del mapa y la agenda de conciertos</li>
          <li>Permitirte comentar, guardar shows y recibir alertas de tus artistas favoritos</li>
          <li>Entender qué contenido funciona mejor y mejorar la experiencia del sitio</li>
          <li>Medir el rendimiento de nuestra difusión y publicidad (Google Ads)</li>
          <li>Cumplir obligaciones legales</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="3. Con quién compartimos datos">
        <LegalList>
          <li>
            <strong className="font-medium text-foreground">Google LLC</strong>, a través de Google
            Analytics y Google Ads, para las finalidades descriptas arriba, sujeto a la Política de
            Privacidad de Google.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              Plataformas de venta de entradas
            </strong>{" "}
            (como AllAccess u otras) a las que te redirigimos para comprar tu entrada. La compra y
            los datos que compartas ahí se rigen por las políticas propias de cada plataforma, no
            por esta.
          </li>
          <li>No vendemos tus datos personales a terceros.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="4. Cookies">
        <p>
          Usamos cookies propias y de terceros (Google Analytics) para recordar tus preferencias y
          medir el uso del sitio. Podés aceptar o rechazar las cookies no esenciales desde el banner
          que aparece en tu primera visita, y cambiar tu elección en cualquier momento desde la
          configuración de tu navegador.
        </p>
      </LegalSection>

      <LegalSection title="5. Tus derechos">
        <p>
          De acuerdo con la Ley 25.326, tenés derecho a acceder, rectificar, actualizar o solicitar
          la supresión de tus datos personales (derecho de hábeas data), y a revocar tu
          consentimiento en cualquier momento. Para ejercer estos derechos, escribinos a{" "}
          <LegalMail />.
        </p>
        <p>
          Si tenés Google Signals activo, también podés gestionar o eliminar tu información desde Mi
          Actividad de Google y controlar la personalización de anuncios desde la Configuración de
          anuncios de Google.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública (AAIP), como órgano de control de la Ley
          25.326, tiene la facultad de atender denuncias y reclamos de quienes consideren afectados
          sus derechos.
        </p>
      </LegalSection>

      <LegalSection title="6. Cambios a esta política">
        <p>
          Podemos actualizar esta política ocasionalmente. Publicaremos cualquier cambio en esta
          misma página junto con la fecha de actualización correspondiente.
        </p>
      </LegalSection>

      <LegalSection title="7. Contacto">
        <p>
          Si tenés preguntas sobre esta Política de Privacidad, escribinos a <LegalMail />.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
