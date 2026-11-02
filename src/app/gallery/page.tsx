import { DoorGallery } from "@/components/DoorGallery";
import { LeadTimeNote } from "@/components/LeadTimeNote";
import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { galleryFaqs } from "@/content/faqs";
import { breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Iron Door Gallery",
  description:
    "Browse Artistic Entrances custom iron entry doors, then open any style in the designer to choose glass, hardware, and finish.",
  path: "/gallery",
});

export default function GalleryPage() {
  return (
    <main>
      <JsonLd data={faqSchema(galleryFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Gallery", path: "/gallery" },
        ])}
      />
      <section className="page-hero">
        <p className="eyebrow">Door catalog</p>
        <h1>Iron Door Gallery</h1>
        <p>
          Search the Artistic Entrances door photos by number or name. Open a
          door to choose clear, frosted, rain, or Aquatex glass and send that
          design with your quote request.
        </p>
      </section>
      <DoorGallery />
      <LeadTimeNote />
      <FaqSection
        heading="Gallery Questions"
        intro="How to use the door photos when you are comparing iron entries."
        faqs={galleryFaqs}
      />
    </main>
  );
}
