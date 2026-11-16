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
          message you received. Reply STOP to any text to stop receiving
          texts, or HELP for help. Your phone number and consent are not sold
          or shared with third parties for their own marketing.
        </p>
        <h2>Analytics, advertising, and call tracking</h2>
        <p>
          This site uses Google Analytics, Google Ads, and the Meta (Facebook
          and Instagram) pixel to measure which pages, doors, and ads lead to
          requests. These tools use cookies and similar technology. When you
          send a form, your email address, phone number, name, and ZIP code
          may be shared with Google and Meta in hashed form so they can match
          the request to an ad you saw. Your notes and photos are not part of
          that match.
        </p>
        <p>
          The phone number shown on this site may be a tracking number that
          forwards to the showroom, so {business.name} can tell which
          advertisement or page led to a call. Calls may be recorded for
          quality and training.
        </p>
        <p>
          You can limit ad tracking in your browser or device settings, in
          your Google ad settings, and in your Meta ad preferences. To ask
          about the information {business.name} holds about you, email{" "}
          {business.email}.
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
