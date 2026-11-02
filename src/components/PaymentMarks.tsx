const marks = [
  "American Express",
  "Apple Pay",
  "Diners Club",
  "Discover",
  "Mastercard",
  "Visa",
];

export function PaymentMarks() {
  return (
    <section className="payment-banner" aria-label="Accepted payment methods">
      <p>Accepted when you pay the showroom or an invoice. This site does not take payment.</p>
      <ul>
        {marks.map((mark) => (
          <li key={mark}>{mark}</li>
        ))}
      </ul>
      <p>
        Artistic Entrances does not collect or store card numbers or cardholder
        details on this website. For a question about a charge, contact the bank
        that issued the card.
      </p>
    </section>
  );
}
