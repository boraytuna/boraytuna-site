import type { Metadata, Viewport } from "next";
import { Lato, Prompt } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import YouTubeLite from "@/components/YouTubeLite";
import { site } from "@/lib/site";
import { DEFAULT_OG } from "@/lib/metadata";
import "./globals.css";

// next/font downloads the fonts at build time and serves them from this site,
// so visitors never request Google Fonts directly.
const prompt = Prompt({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-prompt", display: "swap" });
const lato = Lato({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-lato", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.titleSuffix, template: `%s | ${site.titleSuffix}` },
  authors: [{ name: site.name, url: site.url }],
  openGraph: { siteName: site.titleSuffix, locale: site.locale, type: "website", images: [DEFAULT_OG] },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#f1f1f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${prompt.variable} ${lato.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:p-3">
          Skip to content
        </a>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <YouTubeLite />
      </body>
    </html>
  );
}
