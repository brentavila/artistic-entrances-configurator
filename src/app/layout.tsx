import type { Metadata } from "next";
import { GoogleTagManager } from "@/components/GoogleTagManager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Design Your Custom Iron Door | Artistic Entrances",
  description:
    "Explore handcrafted iron door styles, choose your glass, hardware, and finish, and request a personalized quote from Artistic Entrances.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <GoogleTagManager />
        {children}
      </body>
    </html>
  );
}
