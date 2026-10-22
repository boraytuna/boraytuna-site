// Builds each page's <title>, description, canonical URL, Open Graph and Twitter tags.

import type { Metadata } from "next";
import { site } from "./site";
import { isStockImage } from "./content";

type Input = {
  title: string;
  description?: string;
  path: string;
  image?: string;
  imageAlt?: string;
  type?: "website" | "article";
  publishedTime?: string;
};

export const DEFAULT_OG = { url: "/og-default.png", width: 1200, height: 630, alt: `${site.name}, Swimmer & Developer` };

export function pageMetadata({ title, description, path, image, imageAlt, type = "website", publishedTime }: Input): Metadata {
  // Our own images only: stock Unsplash photos fall back to the site's default share image.
  const og = image && !isStockImage(image) ? { url: image, alt: imageAlt ?? title } : DEFAULT_OG;
  // Don't repeat the name when a title already contains it ("Boray Tuna Gören: Swimmer & Developer").
  const fullTitle = title.includes(site.name) ? title : `${title} | ${site.titleSuffix}`;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      url: path,
      siteName: site.titleSuffix,
      locale: site.locale,
      title: fullTitle,
      description,
      images: [og],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [og.url] },
  };
}
