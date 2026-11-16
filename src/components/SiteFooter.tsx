import { PaymentMarks } from "@/components/PaymentMarks";
import { business } from "@/lib/business";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a className="footer-logo" href="/" aria-label="Artistic Entrances home">
        <img src="/brand/logo-horizontal.png" alt="Artistic Entrances" width={220} height={106} />
      </a>
      <address>
        {business.street}
        <br />
        {business.city}, {business.region} {business.postalCode}
        <br />
        <a data-cta-location="footer" href={`tel:${business.phoneTel}`}>{business.phoneDisplay}</a>
        <br />
        <a data-cta-location="footer" href={`mailto:${business.email}`}>{business.email}</a>
        <br />
        {business.hoursLabel}
      </address>
      <nav aria-label="Footer" data-cta-location="footer">
        <a href="/projects">Projects</a>
        <a href="/gallery">Gallery</a>
        <a data-cta="design_your_door" href="/design-your-door">Design Your Door</a>
        <a href="/las-vegas-iron-doors">Las Vegas</a>
        <a data-cta="request_catalog" href="/catalog">Catalog</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/privacy">Privacy</a>
      </nav>
      <div className="footer-notes">
        <p>
          Hand-forged iron can vary a little in pattern and color from the
          photo. Pictures are a guide. A custom order follows the drawing you
          approve, and those small differences come from making the piece by
          hand.
        </p>
        <p>
          After that drawing is approved, production usually takes 8 to 16
          weeks. In-stock doors are at{" "}
          <a href="https://artisticentrances.shop">artisticentrances.shop</a>.
        </p>
        <p>
          Rated 5.0 on Google.{" "}
          <a href={business.googleProfileUrl}>Read the reviews</a>.
        </p>
        <PaymentMarks />
      </div>
    </footer>
  );
}
