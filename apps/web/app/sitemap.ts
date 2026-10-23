import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE_URL } from "@/lib/site";

const PRIORITY: Record<string, number> = {
  "/welcome": 1,
  "/attendance-calculator": 0.9,
  "/cgpa-calculator": 0.9,
  "/grade-points": 0.8,
  "/install": 0.5,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: path === "/welcome" ? "weekly" : "monthly",
    priority: PRIORITY[path] ?? 0.5,
  }));
}
