import type { Faq } from "@/lib/seo";

export function FaqSection({
  heading,
  intro,
  faqs,
}: {
  heading: string;
  intro: string;
  faqs: Faq[];
}) {
  return (
    <section className="faq-section" aria-labelledby="faq-heading">
      <div className="section-intro">
        <p className="eyebrow">Questions</p>
        <h2 id="faq-heading">{heading}</h2>
        <p>{intro}</p>
      </div>
      <div className="faq-list">
        {faqs.map((faq) => (
          <details key={faq.question}>
            <summary>
              <h3>{faq.question}</h3>
            </summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
