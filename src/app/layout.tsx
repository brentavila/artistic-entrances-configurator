import type { Metadata } from "next";
import { GoogleTagManager } from "@/components/GoogleTagManager";
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
      <body>
        <GoogleTagManager />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
