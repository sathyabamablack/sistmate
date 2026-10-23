import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/welcome", "/attendance-calculator", "/cgpa-calculator", "/grade-points", "/install"],
      // Everything behind a sign-in, plus the API, stays out of search results.
      disallow: [
        "/api/",
        "/login",
        "/setup",
        "/offline",
        "/attendance",
        "/calculator",
        "/courses",
        "/fees",
        "/marks",
        "/notifications",
        "/results",
        "/settings",
        "/support",
        "/timetable",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
