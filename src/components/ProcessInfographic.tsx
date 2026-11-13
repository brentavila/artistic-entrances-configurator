import { business } from "@/lib/business";
import { catalog } from "@/lib/catalog";
import "@/styles/trust.css";

const doorCount = catalog.doors.length;

const steps = [
  {
    title: "Choose a door",
    copy: `Browse ${doorCount} door designs in the gallery and note the door number you like.`,
    tag: "",
  },
  {
    title: "Glass, handle and finish",
    copy: "Pick clear, frosted, rain, or Aquatex glass, a handle, and a finish. Your choices are saved with the quote request.",
    tag: "",
  },
  {
    title: "Showroom confirms",
    copy: "The Las Vegas showroom confirms measurements and price before anything is built.",
    tag: "",
  },
  {
    title: "Approve the drawing",
    copy: "You review and approve the drawing before production begins.",
    tag: "",
  },
  {
    title: "Production",
    copy: "Production usually runs 8 to 16 weeks after the drawing is approved.",
    tag: "8 to 16 weeks",
  },
];

export function ProcessInfographic() {
  return (
    <section className="tr-process" aria-labelledby="process-heading">
      <div className="tr-process-inner">
        <p className="eyebrow">How a project works</p>
        <h2 id="process-heading">Five Steps From a Door You Like to a Door Made for Your Entry</h2>
        <p className="tr-process-lede">
          Nothing is built until the showroom has confirmed the opening and you
          have approved the drawing.
        </p>
        <ol className="tr-steps">
          {steps.map((step, index) => (
            <li className="tr-step" key={step.title}>
              <span className="tr-node" aria-hidden="true">
                {index + 1}
              </span>
              <h3>
                <span className="tr-sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p>{step.copy}</p>
              {step.tag ? <span className="tr-step-tag">{step.tag}</span> : null}
            </li>
          ))}
        </ol>
        <p className="tr-process-note">
          Questions at any step: call {business.phoneDisplay} or{" "}
          <a href="/contact">contact the showroom</a>.
        </p>
      </div>
    </section>
  );
}
