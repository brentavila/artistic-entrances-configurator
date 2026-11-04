import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { LeadForm } from "@/components/LeadForm";
import { contactFaqs } from "@/content/faqs";
import { business } from "@/lib/business";
import { breadcrumbSchema, faqSchema, localBusinessSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact Artistic Entrances in Las Vegas",
  description:
    "Call, email, or message Artistic Entrances in Las Vegas about a custom iron entry door. Showroom hours are Monday through Saturday.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <main>
      <JsonLd data={localBusinessSchema()} />
      <JsonLd data={faqSchema(contactFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      <section className="page-hero">
        <p className="eyebrow">Las Vegas showroom</p>
        <h1>Contact Artistic Entrances</h1>
        <p>
          Call {business.phoneDisplay}, email {business.email}, or send the form.
          Hours are {business.hoursLabel}. For a door you already designed, use
          Design Your Door so the glass, handle, and finish are included.
        </p>
      </section>
      <section className="split-section">
        <div>
          <h2>Showroom</h2>
          <p>
            {business.street}
            <br />
            {business.city}, {business.region} {business.postalCode}
          </p>
          <p>
            <a href={`tel:${business.phoneTel}`}>{business.phoneDisplay}</a>
            <br />
            <a href={`mailto:${business.email}`}>{business.email}</a>
          </p>
          <p>
            <a href={business.mapUrl}>Open the showroom in Google Maps</a>
          </p>
        </div>
        <LeadForm
          leadType="contact"
          notesLabel="How can we help?"
          submitLabel="Send Message"
        />
      </section>
      <FaqSection
        heading="Contact Questions"
        intro="How to reach the Las Vegas showroom and what to have ready."
        faqs={contactFaqs}
      />
    </main>
  );
}
