import type { ReactNode } from "react";
import { googleRating } from "@/content/reviews";
import { business } from "@/lib/business";
import "@/styles/trust.css";

type Badge = {
  id: string;
  title: string;
  copy: string;
  icon: ReactNode;
  href?: string;
};

const icons = {
  star: (
    <polygon points="12 3.5 14.6 9.1 20.7 9.8 16.1 13.9 17.4 20 12 16.9 6.6 20 7.9 13.9 3.3 9.8 9.4 9.1" />
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  drawing: (
    <>
      <path d="M6 3h8.5L19 7.5V21H6z" />
      <path d="M14.5 3v4.5H19" />
      <path d="M9 14.5l2.2 2.2 4-4.4" />
    </>
  ),
  measure: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </>
  ),
  mockup: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <rect x="10" y="13" width="4" height="7" />
    </>
  ),
};

const badges: Badge[] = [
  {
    id: "google",
    title: googleRating.label,
    copy: "Rated on the Artistic Entrances Google Business Profile. Read the reviews on Google.",
    icon: icons.star,
    href: business.googleProfileUrl,
  },
  {
    id: "showroom",
    title: "Las Vegas showroom",
    copy: `Visit ${business.street}. Open ${business.hoursLabel}.`,
    icon: icons.pin,
  },
  {
    id: "drawing",
    title: "Drawing approved first",
    copy: "You approve the drawing before anything is built.",
    icon: icons.drawing,
  },
  {
    id: "measure",
    title: "Measurements and price confirmed",
    copy: "The showroom confirms measurements and price before anything is built.",
    icon: icons.measure,
  },
  {
    id: "mockup",
    title: "Mockup for Greater Las Vegas",
    copy: "Greater Las Vegas homeowners who send their contact details can have a mockup prepared.",
    icon: icons.mockup,
  },
];

export function TrustBadges({
  variant = "strip",
  heading = "What to Expect From the Showroom",
  intro = "Plain facts about how a custom door project works with Artistic Entrances.",
}: {
  variant?: "strip" | "grid";
  heading?: string;
  intro?: string;
}) {
  const items = badges.map((badge) => {
    const body = (
      <>
        <svg className="tr-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {badge.icon}
        </svg>
        <span className="tr-badge-text">
          <span className="tr-badge-title">{badge.title}</span>
          <span className="tr-badge-copy">{badge.copy}</span>
        </span>
      </>
    );
    return (
      <li key={badge.id}>
        {badge.href ? (
          <a className="tr-badge-link" href={badge.href}>
            {body}
          </a>
        ) : (
          body
        )}
      </li>
    );
  });

  if (variant === "strip") {
    return (
      <section className="tr-strip" aria-label="Why homeowners choose Artistic Entrances">
        <ul className="tr-badges">{items}</ul>
      </section>
    );
  }

  return (
    <section className="tr-section tr-badge-grid" aria-labelledby="trust-badges-heading">
      <div className="section-intro">
        <p className="eyebrow">Before you commit</p>
        <h2 id="trust-badges-heading">{heading}</h2>
        <p>{intro}</p>
      </div>
      <ul className="tr-badges">{items}</ul>
    </section>
  );
}
