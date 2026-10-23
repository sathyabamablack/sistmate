/**
 * Public-site facts shared by metadata, robots, the sitemap and structured data.
 * Set NEXT_PUBLIC_SITE_URL to the real domain once there is one; until then Vercel's
 * production URL is used, and localhost in development.
 */

export const SITE_NAME = "Student Portal";

export const SITE_TAGLINE = "Attendance, CGPA and LMS for Sathyabama students";

export const SITE_DESCRIPTION =
  "An independent student dashboard over the Sathyabama ERP and LMS: attendance against the 80% line, results and CGPA on the official grade scale, timetable, fees, notices and course files.";

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

/** Pages a search engine may index. */
export const PUBLIC_PATHS = [
  "/welcome",
  "/attendance-calculator",
  "/cgpa-calculator",
  "/grade-points",
  "/install",
] as const;

/** Share card for pages that set their own `openGraph` (which replaces the file-based image). */
export const OG_IMAGES = [
  {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "Student Portal: attendance, CGPA and LMS for Sathyabama students",
  },
];
