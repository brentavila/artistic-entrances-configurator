import { FaqSection } from "@/components/FaqSection";
import { GoogleReviews } from "@/components/GoogleReviews";
import { JsonLd } from "@/components/JsonLd";
import { LeadTimeNote } from "@/components/LeadTimeNote";
import { ProjectGallery } from "@/components/ProjectGallery";
import { projectFaqs } from "@/content/faqs";
import { breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Iron Door Projects in Las Vegas",
  description:
    "See Artistic Entrances iron doors installed on Las Vegas homes: arched double entries, single doors, patio doors, textured glass, and smart locks.",
  path: "/projects",
});

export default function ProjectsPage() {
  return (
    <main>
      <JsonLd data={faqSchema(projectFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Projects", path: "/projects" },
        ])}
      />
      <section className="page-hero">
        <p className="eyebrow">Installed work</p>
        <h1>Iron Door Projects in Las Vegas</h1>
        <p>
          These are doors Artistic Entrances has put on houses: double entries,
          a single door with textured glass, patio doors, and the hardware
          homeowners actually use. The catalog is the full set of styles. This
          page is the finished work.
        </p>
      </section>
      <section className="page-section">
        <ProjectGallery />
      </section>
      <GoogleReviews heading="Homeowners Who Had a Door Installed" />
      <LeadTimeNote />
      <FaqSection
        heading="Project Questions"
        intro="What these photos show, and how a similar door gets started."
        faqs={projectFaqs}
      />
    </main>
  );
}
