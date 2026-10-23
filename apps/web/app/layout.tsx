import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider, themeBootScript } from "@/components/layout/ThemeProvider";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { DEFAULT_PREFS, prefsBootScript, prefsToDataAttributes } from "@/lib/prefs";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: attendance, CGPA and LMS for Sathyabama students`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Closed by default: the public pages opt in with their own `robots`, so a signed-in
  // page can never be indexed by forgetting a tag.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    title: `${SITE_NAME}: attendance, CGPA and LMS for Sathyabama students`,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: {
    capable: true,
    title: "Portal",
    statusBarStyle: "default",
  },
  // Setting `icons` replaces the file-based app/icon.svg link, so list it too.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // Light is the default theme for everyone; ThemeProvider swaps this when a student picks dark.
  themeColor: "#f3f6f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No cookies() here: that would make every page dynamic (a function run per view). The HTML
  // carries the default accent, density, text size and motion, and prefsBootScript swaps in the
  // student's own from the cookie before first paint.
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${bricolage.variable}`}
      {...prefsToDataAttributes(DEFAULT_PREFS)}
      suppressHydrationWarning
    >
      <head>
        {/* Set theme and display preferences before paint to avoid a flash of the wrong look. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: prefsBootScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
