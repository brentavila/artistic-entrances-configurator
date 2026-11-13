import { FaqSection } from "@/components/FaqSection";
import { GoogleReviews } from "@/components/GoogleReviews";
import { LeadTimeNote } from "@/components/LeadTimeNote";
import { ShowroomMap } from "@/components/ShowroomMap";
import { TrustBadges } from "@/components/TrustBadges";
import { JsonLd } from "@/components/JsonLd";
import { lasVegasFaqs } from "@/content/faqs";
import { business, serviceCities } from "@/lib/business";
import { breadcrumbSchema, faqSchema, localBusinessSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Custom Iron Doors in Las Vegas, Nevada",
  description:
    "Artistic Entrances designs and quotes custom iron entry doors for Las Vegas, Henderson, North Las Vegas, Summerlin, and nearby communities.",
  path: "/las-vegas-iron-doors",
});

export default function LasVegasPage() {
  return (
    <main>
      <JsonLd data={localBusinessSchema()} />
      <JsonLd data={faqSchema(lasVegasFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Las Vegas Iron Doors", path: "/las-vegas-iron-doors" },
        ])}
      />
      <section className="page-hero">
        <p className="eyebrow">Las Vegas, Nevada</p>
        <h1>Custom Iron Doors in Las Vegas</h1>
        <p>
          Artistic Entrances is a Las Vegas iron door showroom at {business.street},{" "}
          {business.city}, {business.region} {business.postalCode}. Homeowners,
          builders, and contractors use the gallery to choose a door, then record
          glass, handle, and finish for a local quote. Call {business.phoneDisplay}{" "}
          {business.hoursLabel}.
        </p>
      </section>

      <section className="page-section prose-section">
        <h2>Iron Entry Doors for Las Vegas Homes</h2>
        <p>
          Desert light, stucco, stone, and wide elevations reward an entry with
          real presence. An iron door can hold decorative metal and a large glass
          lite without giving up a secure frame. Artistic Entrances reviews the
          opening, swing, threshold, and hardware prep with you or your builder
          before production.
        </p>
        <h2>Neighborhoods We Quote</h2>
        <p>
          The greater Las Vegas service area includes {serviceCities.join(", ")}.
          A ZIP code in that area makes a quote request eligible for a generated
          mockup of the selected door, finish, handle, and glass. Submit the
          design form first. The mockup is not created anonymously.
        </p>
        <p>
          If the project is outside greater Las Vegas, send the design anyway.
          Those requests are tagged for a conversation with the team and do not
          receive the automated mockup.
        </p>
        <h2>Glass That Fits the Climate and the Foyer</h2>
        <p>
          Clear glass keeps a view through the entry. Frosted glass adds privacy
          while still bringing in light. Rain glass uses a vertical texture.
          Aquatex glass has a wavy pattern that obscures the interior. West-facing
          Las Vegas entries often need that privacy as much as they need light.
          The team confirms which glass can be built into the door you selected.
        </p>
        <h2>Visit or Call the Showroom</h2>
        <p>
          <a href={business.googleProfileUrl}>See the Google reviews and map</a>
          {" "}or <a href={business.mapUrl}>get directions to {business.street}</a>. Email{" "}
          <a href={`mailto:${business.email}`}>{business.email}</a> with door
          numbers, plans, or a photo of the current entry.
        </p>
        <a className="primary-action" href="/design-your-door">
          Design a Las Vegas Door
        </a>
      </section>

      <TrustBadges variant="grid" />
      <GoogleReviews heading="Reviews from the Las Vegas Showroom" />
      <LeadTimeNote />
      <ShowroomMap />
      <FaqSection
        heading="Las Vegas Iron Door Questions"
        intro="Service area, showroom location, and what to expect on a local project."
        faqs={lasVegasFaqs}
      />
    </main>
  );
}
