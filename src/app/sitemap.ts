import type { MetadataRoute } from "next";
import { business } from "@/lib/business";

const paths = [
  "/",
  "/design-your-door",
  "/projects",
  "/gallery",
  "/las-vegas-iron-doors",
  "/catalog",
  "/about",
  "/contact",
  "/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: `${business.siteUrl}${path}`,
    changeFrequency: path === "/" || path === "/gallery" ? "weekly" : "monthly",
    priority: path === "/" || path === "/las-vegas-iron-doors" ? 1 : 0.7,
  }));
}
