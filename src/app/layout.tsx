import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import Toaster from "@/components/Toaster";
import { readFlash } from "@/lib/flash";

// Self-hosted via next/font, exposed as a CSS variable so Tailwind's
// font-sans (see tailwind.config.ts) picks it up everywhere. Hanken Grotesk
// is a warm humanist grotesque, chosen deliberately over the default-looking
// Inter/Geist; its tabular figures keep health scores and dollar amounts
// aligned in columns.
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans" });

// Runs before first paint so a saved dark theme never flashes light. Kept as
// a plain string (not a component) because it must execute synchronously in
// <head>. Falls back to the OS preference when the user hasn't chosen yet.
const themeInit = `(function () {
  try {
    var t = localStorage.getItem("hearth-theme");
    if (
      t === "dark" ||
      (!t && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();`;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Organization JSON-LD, so search results can attribute pages to Hearth as a
// business rather than guessing from the page title. Mirrors the Service
// JSON-LD CityLandingPage builds per city (src/components/CityLandingPage.tsx):
// same reasoning, root-level scope. areaServed names the county, not a city,
// since Hearth isn't limited to the two cities that have their own landing
// pages today.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Hearth",
  url: SITE_URL,
  areaServed: {
    "@type": "AdministrativeArea",
    name: "Orange County, CA",
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Hearth: Your home, looked after",
    template: "%s | Hearth",
  },
  description:
    "Keep your house in good shape, know what needs attention, store your home docs, and reach a trustworthy pro when something breaks.",
  openGraph: {
    siteName: "Hearth",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const flash = readFlash();
  return (
    // suppressHydrationWarning: the theme script adds .dark to <html> before
    // React hydrates, which is an expected server/client mismatch.
    // The font variable + font-sans live on <html>, not <body>: Tailwind's
    // preflight declares font-family on html, and a var() undefined at that
    // level invalidates the whole declaration, silently dropping the site to
    // the browser's default serif.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} font-sans`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body>
        {children}
        <Toaster flash={flash} />
      </body>
    </html>
  );
}
