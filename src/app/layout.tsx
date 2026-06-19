import type { Metadata } from "next";
import "./globals.css";
import Toaster from "@/components/Toaster";
import { readFlash } from "@/lib/flash";

export const metadata: Metadata = {
  title: "Hearth: Your home, looked after",
  description:
    "Keep your house in good shape, know what needs attention, store your home docs, and reach a trustworthy pro when something breaks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const flash = readFlash();
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster flash={flash} />
      </body>
    </html>
  );
}
