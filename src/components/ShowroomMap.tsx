import { business, serviceCities } from "@/lib/business";
import "@/styles/trust.css";

const fullAddress = `${business.street}, ${business.city}, ${business.region} ${business.postalCode}`;
const placeQuery = `${business.name}, ${fullAddress}`;

function embedSrc() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(placeQuery)}&zoom=15`;
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(placeQuery)}&z=15&output=embed`;
}

export function ShowroomMap({
  heading = "Visit the Las Vegas Showroom",
  intro = "See the doors in person, talk through your opening, and have the showroom confirm measurements and price.",
}: {
  heading?: string;
  intro?: string;
}) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`;

  return (
    <section className="tr-section" aria-labelledby="showroom-map-heading">
      <div className="section-intro">
        <p className="eyebrow">Showroom</p>
        <h2 id="showroom-map-heading">{heading}</h2>
        <p>{intro}</p>
      </div>
      <div className="tr-map">
        <div className="tr-map-frame">
          <iframe
            title={`Map showing the ${business.name} showroom at ${fullAddress}`}
            src={embedSrc()}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <div className="tr-map-card">
          <h3>{business.name}</h3>
          <dl className="tr-map-details">
            <div>
              <dt>Address</dt>
              <dd>
                {business.street}
                <br />
                {business.city}, {business.region} {business.postalCode}
              </dd>
            </div>
            <div>
              <dt>Hours</dt>
              <dd>{business.hoursLabel}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${business.phoneTel}`}>{business.phoneDisplay}</a>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${business.email}`}>{business.email}</a>
              </dd>
            </div>
          </dl>
          <div className="tr-map-actions">
            <a className="primary-action" href={directionsUrl}>
              Get Directions
            </a>
            <a className="tr-link" href={business.googleProfileUrl}>
              Google Business Profile
            </a>
          </div>
          <div className="tr-map-cities">
            <h4>Areas we serve</h4>
            <ul>
              {serviceCities.map((city) => (
                <li key={city}>{city}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
