export const business = {
  name: "Artistic Entrances",
  legalName: "Artistic Entrances",
  phoneDisplay: "(725) 302-1391",
  phoneTel: "+17253021391",
  email: "sales@artisticentrances.co",
  street: "71 N Pecos Rd, Ste 110",
  city: "Las Vegas",
  region: "NV",
  regionName: "Nevada",
  postalCode: "89101",
  country: "US",
  hoursLabel: "Monday–Saturday, 9:00am–5:30pm Pacific",
  opens: "09:00",
  closes: "17:30",
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://artisticentrances.co").replace(
    /\/$/,
    "",
  ),
  ghlLocationId: "uK4q8lpwDpm1J32DZxO4",
  mapUrl:
    "https://www.google.com/maps/search/?api=1&query=71+N+Pecos+Rd+Ste+110+Las+Vegas+NV+89101",
  googleProfileUrl: "https://maps.app.goo.gl/1WJQNSXsoGSJSBq7A",
};

export const serviceCities = [
  "Las Vegas",
  "Henderson",
  "North Las Vegas",
  "Summerlin",
  "Enterprise",
  "Spring Valley",
  "Paradise",
  "Green Valley",
  "Boulder City",
  "Mountains Edge",
];
