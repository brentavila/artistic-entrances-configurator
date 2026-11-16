import type { Metadata } from "next";
import Script from "next/script";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { CallTracking } from "@/components/CallTracking";
import { MetaPixel } from "@/components/MetaPixel";
import { GTM_ID, GoogleTagManagerNoscript } from "@/components/GoogleTagManager";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { business } from "@/lib/business";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(business.siteUrl),
  title: {
    default: "Custom Iron Entry Doors in Las Vegas | Artistic Entrances",
    template: "%s | Artistic Entrances",
  },
  description:
    "Artistic Entrances designs custom iron entry doors in Las Vegas. Choose glass, hardware, and finish, then request a quote from the local showroom.",
  applicationName: "Artistic Entrances",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <Script id="google-tag-manager" strategy="beforeInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      </head>
      <body>
        <GoogleTagManagerNoscript />
        <MetaPixel />
        <AnalyticsProvider />
        <CallTracking />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
