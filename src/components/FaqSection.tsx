import { Fragment } from "react";
import { TrackedPhoneText } from "@/components/TrackedPhone";
import { business } from "@/lib/business";
import type { Faq } from "@/lib/seo";

function answerWithPhone(answer: string) {
  const parts = answer.split(business.phoneDisplay);
  if (parts.length === 1) return answer;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <TrackedPhoneText /> : null}
      {part}
    </Fragment>
  ));
}

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
            <p>{answerWithPhone(faq.answer)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
