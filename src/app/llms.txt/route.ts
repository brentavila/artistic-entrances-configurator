import { business, serviceCities } from "@/lib/business";

export function GET() {
  const body = `# Artistic Entrances

> Custom iron entry doors in Las Vegas, Nevada.

Artistic Entrances designs custom iron entry doors for luxury homes. The showroom is at ${business.street}, ${business.city}, ${business.region} ${business.postalCode}. Phone ${business.phoneDisplay}. Email ${business.email}. Hours ${business.hoursLabel}.

Service area: ${serviceCities.join(", ")}.

Glass options: clear, frosted, rain, and Aquatex.
Customers record a door, glass type, handle, and finish on ${business.siteUrl}/design-your-door.
Greater Las Vegas quote requests are eligible for a generated mockup after contact details are submitted. Projects outside greater Las Vegas are followed up by conversation and do not receive that mockup.

Installed projects: ${business.siteUrl}/projects
Door catalog: ${business.siteUrl}/gallery
Catalog requests: ${business.siteUrl}/catalog
Google reviews: ${business.googleProfileUrl}
Las Vegas location page: ${business.siteUrl}/las-vegas-iron-doors

A $500 Amazon gift card is a published offer with the purchase of a qualifying custom iron entry door. Terms apply. It is not an automatic website discount.

Pricing is quoted after the opening, glass, hardware, finish, and installation needs are reviewed.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
