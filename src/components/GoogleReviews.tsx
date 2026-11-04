import { googleRating, googleReviews } from "@/content/reviews";
import { business } from "@/lib/business";

export function GoogleReviews({
  heading = "What Las Vegas Homeowners Say",
}: {
  heading?: string;
}) {
  return (
    <section className="reviews" aria-labelledby="google-reviews-heading">
      <div className="section-intro">
        <p className="eyebrow">Google reviews</p>
        <h2 id="google-reviews-heading">{heading}</h2>
        <p>
          Artistic Entrances is rated {googleRating.label}. These notes are from
          the Google Business Profile.{" "}
          <a href={business.googleProfileUrl}>Read the reviews on Google</a>.
        </p>
      </div>
      <div className="review-grid">
        {googleReviews.map((review) => (
          <blockquote key={review.date + review.quote.slice(0, 24)}>
            <p className="review-stars" aria-label="5 out of 5 stars">
              ★★★★★
            </p>
            <p>{review.quote}</p>
            <footer>
              Google review · {review.date}
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}
