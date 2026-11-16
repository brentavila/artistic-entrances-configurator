import type { Metadata } from "next";
import { business, serviceCities } from "@/lib/business";

export type Faq = { question: string; answer: string };

export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${business.siteUrl}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: business.name,
      locale: "en_US",
      type: "website",
    },
  };
}

export function faqSchema(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${business.siteUrl}${item.path}`,
    })),
  };
}

export function localBusinessSchema() {
  const logo = `${business.siteUrl}${business.logoPath}`;
  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${business.siteUrl}/#business`,
    name: business.name,
    legalName: business.legalName,
    url: business.siteUrl,
    image: `${business.siteUrl}/media/doors/full/website-images-1.webp`,
    logo,
    hasMap: business.mapUrl,
    telephone: business.phoneTel,
    email: business.email,
    sameAs: [business.googleProfileUrl, business.shopUrl],
    address: {
      "@type": "PostalAddress",
      streetAddress: business.street,
      addressLocality: business.city,
      addressRegion: business.region,
      postalCode: business.postalCode,
      addressCountry: business.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: business.latitude,
      longitude: business.longitude,
    },
    areaServed: serviceCities.map((name) => ({
      "@type": "City",
      name,
      containedInPlace: { "@type": "State", name: "Nevada" },
    })),
    openingHoursSpecification: business.days.map((dayOfWeek) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek,
      opens: business.opens,
      closes: business.closes,
    })),
    makesOffer: {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Custom iron entry doors",
        areaServed: "Greater Las Vegas, Nevada",
        provider: { "@id": `${business.siteUrl}/#business` },
      },
    },
  };
}

/** One graph on every page: local business + website. */
export function siteGraphSchema() {
  const org = localBusinessSchema();
  const businessNode = { ...org };
  delete (businessNode as { "@context"?: string })["@context"];
  return {
    "@context": "https://schema.org",
    "@graph": [
      businessNode,
      {
        "@type": "WebSite",
        "@id": `${business.siteUrl}/#website`,
        name: business.name,
        url: business.siteUrl,
        inLanguage: "en-US",
        publisher: { "@id": `${business.siteUrl}/#business` },
      },
    ],
  };
}
