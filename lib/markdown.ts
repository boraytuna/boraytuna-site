// Markdown -> HTML for content files, split into the sections the old site was built from.
//
// Content files mark section boundaries with `<!-- section … -->` comments (kept from the old
// site's layout blocks) and drop in components with markers such as `<!-- contact-form -->`.
// A section with one image beside some text renders as a two-column "split" row, like the
// alternating text/screenshot rows on the old site; everything else renders as a single column.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element, ElementContent } from "hast";
import { imgAttrs } from "./images";
import { site } from "./site";

export const MARKERS = ["contact-form", "social-links", "blog-list", "project-list"] as const;
export type Marker = (typeof MARKERS)[number];

export type Block = { type: "html"; html: string } | { type: "marker"; name: Marker };
export type Section = ({ layout: "stack" } & { blocks: Block[] }) | { layout: "split"; text: string; image: string; longText: boolean };

type RenderState = { images: number; eagerImages: number };

const IMAGE_LINE = /^!\[[^\]]*\]\([^)]+\)\s*$/gm;

// ---- rehype plugin: responsive images, YouTube facades, external links, image galleries ----

function isWhitespace(n: ElementContent) {
  return n.type === "text" && !n.value.trim();
}

function soloImage(node: ElementContent): boolean {
  if (node.type !== "element" || node.tagName !== "p") return false;
  const kids = node.children.filter((c) => !isWhitespace(c));
  if (kids.length !== 1 || kids[0].type !== "element") return false;
  const k = kids[0];
  return k.tagName === "img" || (k.tagName === "a" && k.children.some((c) => c.type === "element" && c.tagName === "img"));
}

function rehypeSite(options: { state: RenderState; sizes: string }) {
  return (tree: Root) => {
    // Group runs of image-only paragraphs into a grid ("More pictures" sections).
    const group = (parent: Root | Element) => {
      const out: (typeof parent.children)[number][] = [];
      let run: Element[] = [];
      const flush = () => {
        if (run.length >= 2) {
          // Gallery images are drawn at roughly half width, so they can use smaller variants.
          for (const p of run) visit(p, "element", (n) => { if (n.tagName === "img") n.properties.dataGallery = "1"; });
          out.push({ type: "element", tagName: "div", properties: { className: ["gallery"] }, children: run });
        } else out.push(...run);
        run = [];
      };
      for (const child of parent.children) {
        if (soloImage(child as ElementContent)) run.push(child as Element);
        else if (run.length && child.type === "text" && !child.value.trim()) continue;
        else {
          flush();
          out.push(child);
        }
      }
      flush();
      parent.children = out as typeof parent.children;
    };
    group(tree);

    // Links on consecutive lines ("link<br>link") become one paragraph per link, so they get the
    // same button style as links separated by blank lines.
    tree.children = tree.children.flatMap((child) => {
      if (child.type !== "element" || child.tagName !== "p") return [child];
      const kids = child.children.filter((c) => !isWhitespace(c));
      const links = kids.filter((c): c is Element => c.type === "element" && c.tagName === "a");
      const onlyLinks = kids.every((c) => c.type === "element" && (c.tagName === "a" || c.tagName === "br"));
      if (links.length < 2 || !onlyLinks || links.some((a) => a.children.some((c) => c.type === "element" && c.tagName === "img"))) return [child];
      return links.map((a): Element => ({ type: "element", tagName: "p", properties: {}, children: [a] }));
    });

    // Runs of single-link paragraphs ("Blog 1", "Blog 2", …) sit side by side in one wrapping row.
    const isButtonPara = (n: unknown): n is Element => {
      if (!n || (n as Element).type !== "element" || (n as Element).tagName !== "p") return false;
      const kids = (n as Element).children.filter((c) => !isWhitespace(c));
      return kids.length === 1 && kids[0].type === "element" && kids[0].tagName === "a" && !kids[0].children.some((c) => c.type === "element" && c.tagName === "img");
    };
    const rows: Root["children"] = [];
    let run: Element[] = [];
    const flushRow = () => {
      if (run.length >= 2) rows.push({ type: "element", tagName: "div", properties: { className: ["button-group"] }, children: run });
      else rows.push(...run);
      run = [];
    };
    for (const child of tree.children) {
      if (isButtonPara(child)) run.push(child);
      else if (run.length && child.type === "text" && !child.value.trim()) continue;
      else {
        flushRow();
        rows.push(child);
      }
    }
    flushRow();
    tree.children = rows;

    visit(tree, "element", (node, index, parent) => {
      if (node.tagName === "img") {
        const src = String(node.properties.src ?? "");
        const inGallery = node.properties.dataGallery === "1";
        delete node.properties.dataGallery;
        if (src.startsWith("/images/")) {
          const a = imgAttrs(src, inGallery ? "(min-width: 768px) 380px, 100vw" : options.sizes);
          node.properties = { ...node.properties, src: a.src, srcSet: a.srcSet, sizes: a.sizes, width: a.width, height: a.height };
        }
        const eager = options.state.images < options.state.eagerImages;
        options.state.images++;
        node.properties.loading = eager ? "eager" : "lazy";
        node.properties.decoding = "async";
        if (node.properties.alt === undefined) node.properties.alt = "";
      }

      // Replace YouTube iframes with a thumbnail + play button. The real player only loads when
      // clicked (components/YouTubeLite.tsx), which keeps pages with many videos fast on mobile.
      if (node.tagName === "iframe" && parent && index !== undefined) {
        const m = String(node.properties.src ?? "").match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
        if (m) {
          const id = m[1];
          parent.children[index] = {
            type: "element",
            tagName: "div",
            properties: { className: ["yt-lite"], dataId: id },
            children: [
              {
                type: "element",
                tagName: "a",
                properties: { href: `https://www.youtube.com/watch?v=${id}`, className: ["yt-lite__link"], ariaLabel: "Play video" },
                children: [
                  {
                    type: "element",
                    tagName: "img",
                    properties: { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: "", loading: "lazy", decoding: "async", width: 480, height: 360 },
                    children: [],
                  },
                  { type: "element", tagName: "span", properties: { className: ["yt-lite__play"], ariaHidden: "true" }, children: [] },
                ],
              },
            ],
          };
        }
      }

      // A paragraph that is just one text link was a button on the old site ("GitHub!", "More Projects").
      if (node.tagName === "p") {
        const kids = node.children.filter((c) => !isWhitespace(c));
        const only = kids[0];
        if (kids.length === 1 && only.type === "element" && only.tagName === "a" && !only.children.some((c) => c.type === "element" && c.tagName === "img")) {
          node.properties.className = ["button-row"];
          only.properties.className = ["button"];
        }
      }

      if (node.tagName === "a") {
        const href = String(node.properties.href ?? "");
        if ((/^https?:\/\//.test(href) && !href.startsWith(site.url)) || /\.pdf$/i.test(href)) {
          node.properties.target = "_blank";
          node.properties.rel = ["noopener", "noreferrer"];
        }
      }
    });
  };
}

async function toHtml(markdown: string, state: RenderState, sizes?: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeSite, { state, sizes: sizes ?? "(min-width: 768px) 760px, 100vw" })
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

export async function renderSections(body: string, opts: { eagerImages?: number; split?: boolean } = {}): Promise<Section[]> {
  const state: RenderState = { images: 0, eagerImages: opts.eagerImages ?? 1 };
  const chunks = body
    .split(/<!--\s*section[^>]*-->/)
    .map((c) => c.replace(/<!--\s*custom embed[^>]*-->/g, "").trim())
    .filter(Boolean);

  const sections: Section[] = [];
  for (const chunk of chunks) {
    const hasMarker = new RegExp(`<!--\\s*(${MARKERS.join("|")})\\s*-->`).test(chunk);
    const images = chunk.match(IMAGE_LINE) ?? [];
    const text = chunk.replace(IMAGE_LINE, "").trim();
    if (opts.split !== false && !hasMarker && images.length === 1 && text && !/<iframe/i.test(chunk)) {
      // Render the image first so it gets "eager" loading if it is near the top of the page.
      const image = await toHtml(images[0], state, "(min-width: 768px) 560px, 100vw");
      // Short headline + button rows are centred like the old site; long paragraphs read better left-aligned.
      const longText = text.replace(/[#*_[\]()]/g, "").length > 300;
      sections.push({ layout: "split", text: await toHtml(text, state), image, longText });
      continue;
    }
    const parts = chunk.split(new RegExp(`<!--\\s*(${MARKERS.join("|")})\\s*-->`));
    const blocks: Block[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) blocks.push({ type: "marker", name: parts[i] as Marker });
      else if (parts[i].trim()) blocks.push({ type: "html", html: await toHtml(parts[i], state) });
    }
    sections.push({ layout: "stack", blocks });
  }
  return sections;
}

export function hasH1(markdown: string): boolean {
  return /^#\s/m.test(markdown);
}
