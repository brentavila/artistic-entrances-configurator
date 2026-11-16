import type { MetadataRoute } from "next";
import { business } from "@/lib/business";

const paths = [
  "/",
  "/design-your-door",
  "/planner",
  "/projects",
  "/gallery",
  "/las-vegas-iron-doors",
  "/catalog",
  "/about",
  "/contact",
  "/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return paths.map((path) => ({
    url: `${business.siteUrl}${path}`,
    lastModified,
    changeFrequency: path === "/" || path === "/gallery" ? "weekly" : "monthly",
    priority:
      path === "/" || path === "/las-vegas-iron-doors"
        ? 1
        : path === "/privacy"
          ? 0.3
          : 0.7,
  }));
}
