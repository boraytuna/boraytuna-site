// Responsive image attributes from the manifest written by scripts/optimize-images.mjs.

import fs from "node:fs";
import path from "node:path";

type Entry = { width: number; height: number; variants: [number, string][] };
let manifest: Record<string, Entry> | null = null;

function load(): Record<string, Entry> {
  if (manifest) return manifest;
  const file = path.join(process.cwd(), ".generated/images.json");
  manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return manifest!;
}

export type ImgAttrs = { src: string; srcSet?: string; sizes?: string; width?: number; height?: number };

// `sizes` tells the browser how wide the image is drawn, so it can pick the smallest variant that fits.
export function imgAttrs(src: string, sizes = "(min-width: 768px) 760px, 100vw"): ImgAttrs {
  const entry = load()[src];
  if (!entry) return { src };
  const largest = entry.variants[entry.variants.length - 1];
  return {
    src: largest[1],
    srcSet: entry.variants.map(([w, url]) => `${url} ${w}w`).join(", "),
    sizes,
    width: entry.width,
    height: entry.height,
  };
}
