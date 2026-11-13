import { catalog } from "@/lib/catalog";
import "@/styles/trust.css";

// Ordered from the most open view to the most private, following the wording of
// the catalog descriptions. This is a guide, not a measurement.
const order = ["clear", "rain", "frosted", "aquatex"];
const position: Record<string, number> = { clear: 8, rain: 36, frosted: 64, aquatex: 92 };

const glass = order
  .map((id) => catalog.glass.find((item) => item.id === id))
  .filter((item): item is (typeof catalog.glass)[number] => Boolean(item));

export function GlassGuide() {
  return (
    <div className="tr-band">
      <section className="tr-section" aria-labelledby="glass-guide-heading">
        <div className="section-intro">
          <p className="eyebrow">Glass guide</p>
          <h2 id="glass-guide-heading">Light on One Side, Privacy on the Other</h2>
          <p>
            Four glass types, from an open view through the entry to an
            obscured one. Pick the balance that suits the foyer.
          </p>
          <hr className="tr-rule" />
        </div>
        <ul className="tr-glass-grid">
          {glass.map((item) => (
            <li className="tr-glass-card" key={item.id}>
              <div className="tr-glass-sample" data-glass={item.id} role="img" aria-label={`${item.name} glass sample`} />
              <div className="tr-glass-body">
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className="tr-scale" aria-hidden="true">
                  <div className="tr-scale-track">
                    <span className="tr-scale-mark" style={{ left: `${position[item.id]}%` }} />
                  </div>
                  <div className="tr-scale-ends">
                    <span>Open view</span>
                    <span>Privacy</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="tr-glass-note">
          Ordered from open view to most private as a general guide. The
          showroom confirms which glass can be built into the door you choose.{" "}
          <a href="/design-your-door">Try each glass in the designer</a>.
        </p>
      </section>
    </div>
  );
}
