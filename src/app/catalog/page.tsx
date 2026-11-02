import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { LeadForm } from "@/components/LeadForm";
import { catalogFaqs } from "@/content/faqs";
import { breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Request the Iron Door Catalog",
  description:
    "Request the Artistic Entrances iron door catalog. Share your contact details and the Las Vegas team will follow up with sizing, finish, and customization options.",
  path: "/catalog",
});

export default function CatalogPage() {
  return (
    <main>
      <JsonLd data={faqSchema(catalogFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Catalog", path: "/catalog" },
        ])}
      />
      <section className="page-hero">
        <p className="eyebrow">Lead capture</p>
        <h1>Request the Iron Door Catalog</h1>
        <p>
          The catalog popup on the current site asks for contact details before
          sending sizing, finish, and customization information. Use this page
          for the same request. It does not by itself design a door. To save
          glass, handle, and finish, use Design Your Door.
        </p>
      </section>
      <section className="split-section">
        <div>
          <h2>What to Do With the Catalog</h2>
          <ol className="step-list">
            <li>Note the reference number of any door you want priced.</li>
            <li>Measure the existing opening or send the architectural plans.</li>
            <li>Decide whether you want clear, frosted, rain, or Aquatex glass.</li>
            <li>Call the showroom or send a quote request with those choices.</li>
          </ol>
          <p>
            A $500 Amazon gift card is offered with the purchase of a qualifying
            custom iron entry door. Terms and conditions apply. Mention it when
            you request a quote. Requesting the catalog does not redeem the offer.
          </p>
        </div>
        <LeadForm
          leadType="catalog"
          notesLabel="Door numbers or project notes"
          submitLabel="Request the Catalog"
        />
      </section>
      <FaqSection
        heading="Catalog Questions"
        intro="What the catalog request does, and what it does not include."
        faqs={catalogFaqs}
      />
    </main>
  );
}
