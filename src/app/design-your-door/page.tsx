import { Suspense } from "react";
import { DoorConfigurator } from "@/components/DoorConfigurator";
import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { designFaqs } from "@/content/faqs";
import { breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Design Your Custom Iron Door",
  description:
    "Choose an Artistic Entrances iron door, then select clear, frosted, rain, or Aquatex glass, a handle, and a finish. Greater Las Vegas quote requests can include a mockup.",
  path: "/design-your-door",
});

export default function DesignPage() {
  return (
    <main>
      <JsonLd data={faqSchema(designFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Design Your Door", path: "/design-your-door" },
        ])}
      />
      <section className="page-hero">
        <p className="eyebrow">Door designer</p>
        <h1>Design Your Custom Iron Door</h1>
        <p>
          Pick a door style, then choose the glass, handle, and finish. The
          preview shows the door and a sample of the glass. Submit your contact
          details to send the design to Artistic Entrances. Homeowners in greater
          Las Vegas are eligible for a generated mockup. Requests from outside
          that area go to a conversational follow-up instead.
        </p>
      </section>
      <Suspense fallback={<p className="page-loading">Loading the door designer…</p>}>
        <DoorConfigurator />
      </Suspense>
      <FaqSection
        heading="Designer Questions"
        intro="What the preview means, which glass you can choose, and what happens after you send a design."
        faqs={designFaqs}
      />
    </main>
  );
}
