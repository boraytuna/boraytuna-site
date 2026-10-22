// Reads the Markdown files in /content at build time.
//
//   content/blog/<slug>.md      blog posts      -> /<slug>
//   content/projects/<slug>.md  projects        -> /<slug>, plus a card on /my-projects
//   content/pages/<slug>.md     other pages     -> /<slug> (core pages have their own route folders)
//
// The file name is the URL, so old URLs keep working. To add a post or project, add a file.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT = path.join(process.cwd(), "content");

type Base = {
  slug: string;
  path: string;
  title: string;
  metaTitle?: string;
  description?: string;
  ogImage?: string;
  ogImageAlt?: string;
  draft?: boolean;
  body: string;
};

export type Post = Base & {
  date: string;
  minutesToRead?: number;
  categories?: string[];
  coverImage?: string;
  coverImageAlt?: string;
};

export type Project = Base & {
  cardTitle: string;
  summary: string;
  cardImage?: string;
  cardImageAlt?: string;
  categories: string[];
  order: number;
};

export type Page = Base;

// Drafts are visible in `next dev` so you can preview them, and left out of production builds.
const showDrafts = process.env.NODE_ENV !== "production";

function readDir<T extends Base>(dir: string): T[] {
  const full = path.join(CONTENT, dir);
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const parsed = matter(fs.readFileSync(path.join(full, file), "utf8"));
      // YAML turns unquoted dates (date: 2024-04-10T02:21:59Z) into Date objects; keep them as
      // ISO strings so they print correctly in <time>, meta tags and client components.
      const data = Object.fromEntries(
        Object.entries(parsed.data).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
      );
      const content = parsed.content;
      const slug = file.replace(/\.md$/, "");
      return { ...data, slug, path: slug === "home" ? "/" : `/${slug}`, title: data.title ?? slug, body: content } as T;
    })
    .filter((d) => showDrafts || !d.draft);
}

export function getPosts(): Post[] {
  return readDir<Post>("blog").sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export function getProjects(): Project[] {
  return readDir<Project>("projects").sort((a, b) => a.order - b.order);
}

export function getPages(): Page[] {
  return readDir<Page>("pages");
}

export function getPage(slug: string): Page {
  const page = getPages().find((p) => p.slug === slug);
  if (!page) throw new Error(`content/pages/${slug}.md not found`);
  return page;
}

// Pages that have their own folder under /app and are not served by app/[slug].
export const CORE_PAGE_SLUGS = ["home", "my-projects", "blog-list-software-developer", "boray-tuna-goren-about-me", "contact"];

export type Entry = { kind: "post"; doc: Post } | { kind: "project"; doc: Project } | { kind: "page"; doc: Page };

// Everything served by app/[slug]: blog posts, project pages and the remaining content pages.
export function getSlugEntries(): Entry[] {
  return [
    ...getPosts().map((doc) => ({ kind: "post" as const, doc })),
    ...getProjects().map((doc) => ({ kind: "project" as const, doc })),
    ...getPages()
      .filter((p) => !CORE_PAGE_SLUGS.includes(p.slug))
      .map((doc) => ({ kind: "page" as const, doc })),
  ];
}

// Plain-text excerpt for meta descriptions when a file has none.
export function excerpt(markdown: string, max = 155): string {
  const text = markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(" ", max - 1)) + "…";
}

// Stock Unsplash photos were used as share images on the old site; they're replaced by our own.
export function isStockImage(src?: string): boolean {
  return !!src && /(^|\/)unsplash-/.test(src);
}
