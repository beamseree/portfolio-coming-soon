import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { ThemeScript } from "@/components/site/theme-script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const matte = localFont({
  variable: "--font-matte",
  display: "swap",
  // Without this, Next adds a metric-matched Arial right after Matte, and the
  // stack would never reach Inter.
  adjustFontFallback: false,
  src: [
    {
      // Matte 0.100 (github.com/beamseree/matte), cut to Google Fonts' latin
      // subset; anything outside it falls back to Inter.
      path: "./fonts/MatteVariable-Latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: "Beam Sereeyothin",
  description: "Engineer & Designer. Website coming soon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script sets data-theme before React hydrates, so React would
    // otherwise flag <html> as mismatched.
    <html lang="en" className={`${matte.variable} ${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
