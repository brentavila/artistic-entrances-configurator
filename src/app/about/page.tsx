import { FaqSection } from "@/components/FaqSection";
import { LeadTimeNote } from "@/components/LeadTimeNote";
import { JsonLd } from "@/components/JsonLd";
import { aboutFaqs } from "@/content/faqs";
import { business } from "@/lib/business";
import { breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "About Artistic Entrances",
  description:
    "Artistic Entrances is a Las Vegas showroom for custom iron entry doors, working with homeowners, builders, and designers from design through installation options.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <main>
      <JsonLd data={faqSchema(aboutFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />
      <section className="page-hero about-hero">
        <img
          className="about-mark"
          src="/brand/logo-mark.png"
          alt="Artistic Entrances tree mark"
          width={180}
          height={192}
        />
        <div>
          <p className="eyebrow">The showroom</p>
          <h1>About Artistic Entrances</h1>
          <p>
            Artistic Entrances builds custom iron entry doors for luxury homes,
            with a showroom in Las Vegas. The work starts with a door you can
            point to, then glass, hardware, finish, and the measurements of the
            opening.
          </p>
        </div>
      </section>
      <section className="page-section prose-section">
        <h2>A Door, Then the Details</h2>
        <p>
          Most projects begin with a photo from the gallery. The designer records
          the glass type, handle, and finish so the person who calls you already
          knows what you selected. Clear, frosted, rain, and Aquatex glass are
          the standard choices. The preview illustrates the glass and finish on
          the door photo, and handles are shown beside it.
        </p>
        <h2>Who the Team Works With</h2>
        <p>
          Homeowners, contractors, and builders can request a quote. Bring plans
          or a photo of the current entry. The team reviews swing, threshold,
          hardware prep, and whether white-glove delivery or installation is part
          of the Las Vegas project.
        </p>
        <h2>How the Doors Are Built</h2>
        <ul className="spec-list">
          <li>Heavy 12-gauge steel, finished with spray paint. Some designs add an aluminum skin for weather resistance.</li>
          <li>Sizes are made for the opening, including sizes outside the standard set.</li>
          <li>Solid iron, with glass inserts on the designs that use them.</li>
          <li>Scrollwork on wrought-iron styles is formed from 5/8-inch steel.</li>
          <li>Dual-pane tempered glass is standard. Triple-pane hurricane impact glass is available when the opening needs it.</li>
          <li>High-security lock hardware.</li>
          <li>Two layers of insulation for temperature and sound.</li>
          <li>A five-year warranty covers manufacturing defects.</li>
          <li>Have the door installed by a professional, and leave about an inch and a half of clearance so it swings freely.</li>
        </ul>
        <h2>Where to Visit</h2>
        <p>
          {business.name}, {business.street}, {business.city}, {business.region}{" "}
          {business.postalCode}. {business.hoursLabel}. {business.phoneDisplay}.
        </p>
      </section>
      <LeadTimeNote />
      <FaqSection
        heading="About the Company"
        intro="What Artistic Entrances makes and how a project begins."
        faqs={aboutFaqs}
      />
    </main>
  );
}
