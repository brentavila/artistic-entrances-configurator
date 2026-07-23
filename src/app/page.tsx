import { DoorConfigurator } from "@/components/DoorConfigurator";

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Artistic Entrances home">
          <span>AE</span>
          <div>
            <strong>Artistic Entrances</strong>
            <small>Custom Iron Doors</small>
          </div>
        </a>
        <a className="header-cta" href="#configurator">
          Design Your Door
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-grain" />
        <div className="hero-content">
          <p className="eyebrow">Built around your home</p>
          <h1>
            Your Entrance,
            <br />
            <em>Designed By You.</em>
          </h1>
          <p>
            Explore handcrafted iron door styles, choose the details, and share
            your vision with an expert.
          </p>
          <a className="hero-action" href="#configurator">
            Start Designing <span>→</span>
          </a>
          <div className="hero-proof">
            <span>Custom crafted</span>
            <span>Expert guidance</span>
            <span>Personalized quote</span>
          </div>
        </div>
        <div className="hero-arch" aria-hidden="true">
          <div className="arch-door">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="intro">
        <p className="eyebrow">A simpler way to begin</p>
        <h2>From Inspiration To A Door Made For Your Home</h2>
        <p>
          Choose the design language you love. We will help confirm every
          measurement, material, and project detail before your door is made.
        </p>
      </section>

      <DoorConfigurator />

      <section className="trust-section">
        <div>
          <p className="eyebrow">Made personal</p>
          <h2>More Than A Door. A Lasting First Impression.</h2>
        </div>
        <div className="trust-points">
          <article>
            <span>01</span>
            <h3>Designed Around You</h3>
            <p>Every choice begins with your home, style, and priorities.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Guided By Experts</h3>
            <p>Real people confirm fit, compatibility, delivery, and pricing.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Crafted To Endure</h3>
            <p>Distinctive ironwork creates an entrance with presence.</p>
          </article>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span>AE</span>
          <div>
            <strong>Artistic Entrances</strong>
            <small>Custom Iron Doors</small>
          </div>
        </div>
        <p>Custom designs require final review and approval.</p>
      </footer>
    </main>
  );
}
