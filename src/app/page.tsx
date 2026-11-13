import { ByTheNumbers } from "@/components/ByTheNumbers";
import { DoorAnatomy } from "@/components/DoorAnatomy";
import { FeaturedDoors } from "@/components/FeaturedDoors";
import { GlassGuide } from "@/components/GlassGuide";
import { GoogleReviews } from "@/components/GoogleReviews";
import { HeroShowcase } from "@/components/HeroShowcase";
import { LeadTimeNote } from "@/components/LeadTimeNote";
import { ProcessInfographic } from "@/components/ProcessInfographic";
import { ProjectGallery } from "@/components/ProjectGallery";
import { ShowroomMap } from "@/components/ShowroomMap";
import { TrustBadges } from "@/components/TrustBadges";
import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { homeFaqs } from "@/content/faqs";
import { serviceCities } from "@/lib/business";
import { breadcrumbSchema, faqSchema, localBusinessSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Custom Iron Entry Doors in Las Vegas",
  description:
    "Artistic Entrances builds custom iron entry doors for Las Vegas homes. Browse door styles, choose clear, frosted, rain, or Aquatex glass, and request a quote.",
  path: "/",
});

export default function HomePage() {
  return (
    <main>
      <JsonLd data={localBusinessSchema()} />
      <JsonLd data={faqSchema(homeFaqs)} />
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }])} />

      <HeroShowcase />

      <TrustBadges />

      <section className="intro">
        <p className="eyebrow">Start with a real door</p>
        <h2>From a Door You Like to a Quote With Your Options</h2>
        <p>
          The gallery is the catalog you can browse without a popup. When a door
          is right for the house, open it in the designer and record the glass,
          handle, and finish. Those choices are saved with your quote request.
        </p>
      </section>

      <section className="page-section">
        <div className="section-intro">
          <p className="eyebrow">Featured styles</p>
          <h2>Iron Doors to Start From</h2>
          <p>
            Each photo is a starting point. Size, glass, hardware, and finish are
            confirmed for your opening.
          </p>
        </div>
        <FeaturedDoors />
        <a className="secondary-action section-action" href="/gallery">
          Browse the Full Gallery
        </a>
      </section>

      <DoorAnatomy />
      <GlassGuide />

      <section className="page-section">
        <div className="section-intro">
          <p className="eyebrow">Installed in Las Vegas</p>
          <h2>Doors on Real Houses</h2>
          <p>
            A few recent entries, patio doors, and hardware details. The full
            set is on the project gallery.
          </p>
        </div>
        <ProjectGallery limit={3} />
        <a className="secondary-action section-action" href="/projects">
          See the Project Gallery
        </a>
      </section>

      <ByTheNumbers />
      <GoogleReviews />

      <ProcessInfographic />

      <section className="offer-band">
        <p className="eyebrow">Published purchase offer</p>
        <h2>A $500 Amazon Gift Card With a Qualifying Door</h2>
        <p>
          Receive a $500 Amazon gift card when you purchase a qualifying custom
          iron entry door. Terms and conditions apply. Mention this offer when
          you call or request a quote. It is not applied automatically online.
        </p>
      </section>

      <section className="catalog-band">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2>Get the Iron Door Catalog</h2>
          <p>
            The catalog request is the same lead capture as the popup on the
            current site, placed on the page so it can be read and indexed.
            Share your details and Artistic Entrances will follow up with sizing,
            finish, and customization information.
          </p>
          <a className="primary-action" href="/catalog">
            Request the Catalog
          </a>
        </div>
        <ul>
          <li>Door reference numbers for the designs you like</li>
          <li>Glass choices: clear, frosted, rain, and Aquatex</li>
          <li>Finish and hardware direction for the quote</li>
          <li>Service in {serviceCities.slice(0, 4).join(", ")}, and nearby</li>
        </ul>
      </section>

      <LeadTimeNote />
      <ShowroomMap />
      <FaqSection
        heading="Custom Iron Door Questions"
        intro="Straight answers for homeowners comparing iron entry doors in Las Vegas."
        faqs={homeFaqs}
      />
    </main>
  );
}
