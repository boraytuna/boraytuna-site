// Generates /sitemap.xml at build time from the same content the pages are built from,
// so new posts and projects are listed automatically.

import type { MetadataRoute } from "next";
import { CORE_PAGE_SLUGS, getPages, getSlugEntries } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const core = getPages()
    .filter((p) => CORE_PAGE_SLUGS.includes(p.slug))
    .map((p) => ({ url: `${site.url}${p.path === "/" ? "" : p.path}`, priority: p.path === "/" ? 1 : 0.8 }));
  const rest = getSlugEntries().map((e) => ({
    url: `${site.url}${e.doc.path}`,
    ...(e.kind === "post" ? { lastModified: e.doc.date } : {}),
    priority: e.kind === "post" ? 0.6 : 0.7,
  }));
  return [...core, ...rest];
}
