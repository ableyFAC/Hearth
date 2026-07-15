import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Toaster from "@/components/Toaster";
import { readFlash } from "@/lib/flash";

// Self-hosted via next/font, exposed as a CSS variable so Tailwind's
// font-sans (see tailwind.config.ts) picks it up everywhere.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
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
    card: "summary",
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
    // The Inter variable + font-sans live on <html>, not <body>: Tailwind's
    // preflight declares font-family on html, and a var() undefined at that
    // level invalidates the whole declaration, silently dropping the site to
    // the browser's default serif.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} font-sans`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <Toaster flash={flash} />
      </body>
    </html>
  );
}
