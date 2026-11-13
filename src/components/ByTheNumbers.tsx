import { googleRating } from "@/content/reviews";
import { catalog } from "@/lib/catalog";
import "@/styles/trust.css";

// Every figure is computed from catalog.json or reviews.ts, or comes from the
// published 8 to 16 week production note in LeadTimeNote.
const stats = [
  { value: String(catalog.doors.length), label: "Door designs in the catalog" },
  { value: String(catalog.finishes.length), label: "Finish options" },
  { value: String(catalog.glass.length), label: "Glass types" },
  { value: googleRating.score, label: "Rating on Google" },
  { value: "8 to 16", label: "Weeks of production after drawing approval" },
];

export function ByTheNumbers() {
  return (
    <section className="tr-numbers" aria-labelledby="numbers-heading">
      <h2 id="numbers-heading" className="tr-sr-only">
        Artistic Entrances by the numbers
      </h2>
      <dl className="tr-numbers-list">
        {stats.map((stat) => (
          <div className="tr-stat" key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
