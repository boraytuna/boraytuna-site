# boraytuna.com

Personal site of Boray Tuna Gören. It's built with Next.js (App Router, TypeScript) as a fully static site and hosted on AWS S3 + CloudFront.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000, with live reload; drafts are visible here
npm run build      # writes the static site to ./out (resizes images first)
npm run serve      # serves ./out like CloudFront does, on http://localhost:4173
npm run lint
```

For the contact form to send mail locally, copy `.env.example` to `.env.local` and add a Web3Forms access key.

## Add content

Every Markdown file becomes a page, and its URL is the file name.

| Folder | URL | Notes |
|---|---|---|
| `content/blog/my-post.md` | `/my-post` | Listed on the Blog page, newest first (`date`) |
| `content/projects/my-project.md` | `/my-project` | Also gets a card on Projects (`cardTitle`, `summary`, `cardImage`, `categories`, `order`) |
| `content/pages/*.md` | `/<name>` | Home, About, Contact, etc. |

Minimal blog post:

```markdown
---
title: My New Post
date: 2026-11-01
minutesToRead: 3
description: One sentence for Google and link previews.
coverImage: /images/my-screenshot.png
---

Text goes here. Images: ![alt text](/images/my-screenshot.png)
```

- Put images in `public/images/`. The build makes small WebP copies automatically.
- Add `draft: true` to keep a file out of the live site while you work on it.
- `<!-- section -->` comments split a page into sections. A section with one image and some text is shown as two columns.
- YouTube: paste `<iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID"></iframe>` on its own line.

## How it's put together

- `app/`: routes. The five main pages have their own folders; `app/[slug]` builds every post, project and remaining page.
- `lib/content.ts` reads Markdown, `lib/markdown.ts` turns it into HTML, and `lib/metadata.ts` builds SEO/Open Graph tags.
- `components/`: header, footer, project filter, contact form, etc.
- `scripts/optimize-images.mjs`: resizes images at build time. `scripts/make-brand-images.mjs` builds the favicon and share image.
- `scripts/extract-content.mjs`: the one-time migration from the old Hostinger site (report in `migration/`).
- `infra/cloudfront-url-rewrite.js`: CloudFront Function that maps `/page` to `page.html` and redirects `www`.
