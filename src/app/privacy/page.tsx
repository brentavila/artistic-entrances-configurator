import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { privacyFaqs } from "@/content/faqs";
import { business } from "@/lib/business";
import { breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy and Message Consent",
  description:
    "How Artistic Entrances uses quote, catalog, and contact form details, including phone and text consent.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <main>
      <JsonLd data={faqSchema(privacyFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ])}
      />
      <section className="page-hero">
        <p className="eyebrow">Privacy</p>
        <h1>Privacy and Message Consent</h1>
        <p>
          Forms on this site send your details to {business.name} so the team can
          respond about an iron door. Door, glass, handle, and finish selections
          are stored with that request.
        </p>
      </section>
      <section className="page-section prose-section">
        <h2>What the forms are for</h2>
        <p>
          A quote request includes the door design. A catalog request and the
          contact form include your name, email, phone, ZIP code, and notes. An
          optional photo of the current entry can be attached to a quote. The
          ZIP code is used to tell greater Las Vegas projects from projects that
          should be handled in a conversation.
        </p>
        <h2>Calls and texts</h2>
        <p>
          Checking the consent box is permission for {business.name} to call and
          text you about the request you just sent. Message and data rates may
          apply. Consent is not a condition of purchase. You can call{" "}
          {business.phoneDisplay} or email {business.email} to ask about a
          message you received.
        </p>
      </section>
      <FaqSection
        heading="Privacy Questions"
        intro="What is collected, where it goes, and how consent works."
        faqs={privacyFaqs}
      />
    </main>
  );
}
