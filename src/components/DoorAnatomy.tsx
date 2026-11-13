import { catalog } from "@/lib/catalog";
import { jambOptions, lockOptions, screenOptions, sidelightOptions } from "@/lib/design-options";
import "@/styles/trust.css";

const DESIGNER = "/design-your-door";

const jambList = jambOptions
  .filter((option) => !["unsure", "other"].includes(option.id))
  .map((option) => option.name);
const lockNames = lockOptions
  .filter((option) => option.id !== "no-preference")
  .map((option) => option.name.charAt(0).toLowerCase() + option.name.slice(1));
const handleNames = catalog.handles.map((handle) => handle.name);
const glassNames = catalog.glass.map((glass) => glass.name);
const finishNames = catalog.finishes
  .filter((finish) => ["matte-black", "antique-brass", "bronze"].includes(finish.id))
  .map((finish) => finish.name);

type Callout = {
  n: number;
  title: string;
  copy: string;
  cta: string;
  x: number; // percent of the photo width
  y: number; // percent of the photo height
  optional?: boolean;
};

// Positions are measured on /media/doors/full/website-images-1.webp (800 x 800).
const callouts: Callout[] = [
  {
    n: 1,
    title: "Frame and jamb depth",
    copy: `Choose a jamb depth to match the wall: ${jambList.join(", ")}. ${jambOptions.find((o) => o.id === "unsure")?.description}`,
    cta: "Set the jamb depth",
    x: 16,
    y: 50,
  },
  {
    n: 2,
    title: "Glass",
    copy: `Choose from ${catalog.glass.length} glass types: ${glassNames.join(", ")}.`,
    cta: "Choose the glass",
    x: 34,
    y: 21,
  },
  {
    n: 3,
    title: "Handle",
    copy: `${handleNames.join(", ")}. Each has its own profile, from a clean architectural line to decorative hardware.`,
    cta: "Choose the handle",
    x: 53.5,
    y: 55,
  },
  {
    n: 4,
    title: "Lock",
    copy: `Choose a ${lockNames.slice(0, -1).join(", a ")}, or a ${lockNames[lockNames.length - 1]}. ${lockOptions[0].description}`,
    cta: "Choose the lock",
    x: 47.5,
    y: 40.5,
  },
  {
    n: 5,
    title: "Finish",
    copy: `${catalog.finishes.length} finish options, including ${finishNames.join(", ")}.`,
    cta: "Choose the finish",
    x: 34,
    y: 82,
  },
  {
    n: 6,
    title: "Screen",
    copy: `${screenOptions[1].description} The dashed outline shows where it would sit.`,
    cta: "Add a screen",
    x: 86.5,
    y: 93,
    optional: true,
  },
  {
    n: 7,
    title: "Sidelights",
    copy: `Add one glass panel to either side of the door, or ${sidelightOptions[3].description.charAt(0).toLowerCase()}${sidelightOptions[3].description.slice(1)}`,
    cta: "Add sidelights",
    x: 7,
    y: 50,
    optional: true,
  },
];

export function DoorAnatomy() {
  return (
    <section className="tr-section" aria-labelledby="anatomy-heading">
      <div className="section-intro">
        <p className="eyebrow">Anatomy of an iron door</p>
        <h2 id="anatomy-heading">The Parts You Choose</h2>
        <p>
          Every door starts from a design you like. These are the parts that
          are set for your entry in the designer and confirmed by the showroom.
        </p>
        <hr className="tr-rule" />
      </div>
      <div className="tr-anatomy">
        <figure className="tr-anatomy-figure">
          <div className="tr-anatomy-stage">
            <img
              src="/media/doors/full/website-images-1.webp"
              alt="Double iron entry door with a glass grid, a center lock plate, two pull handles, and a paneled base"
              width={800}
              height={800}
              loading="lazy"
              decoding="async"
            />
            <svg className="tr-anatomy-ghost" viewBox="0 0 800 800" aria-hidden="true" focusable="false">
              <rect x="104" y="54" width="592" height="692" />
              <rect x="14" y="70" width="80" height="660" />
              <rect x="706" y="70" width="80" height="660" />
            </svg>
            {callouts.map((c) => (
              <span
                key={c.n}
                className="tr-dot"
                aria-hidden="true"
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
              >
                {c.n}
              </span>
            ))}
          </div>
          <figcaption className="tr-anatomy-caption">
            Door 1 from the catalog. Dashed outlines mark options that are added
            to a door: a screen and sidelights.
          </figcaption>
        </figure>
        <ol className="tr-anatomy-list">
          {callouts.map((c) => (
            <li className="tr-anatomy-item" key={c.n}>
              <span className="tr-anatomy-num" aria-hidden="true">
                {c.n}
              </span>
              <h3>
                {c.title}
                {c.optional ? <span className="tr-anatomy-optional">Optional</span> : null}
              </h3>
              <p>{c.copy}</p>
              <a className="tr-link" href={DESIGNER}>
                {c.cta}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
