// Every blog post, project page and remaining content page lives at /<slug>, exactly like the
// old site. generateStaticParams lists them all so `next build` writes one HTML file per URL.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ContentPage from "@/components/ContentPage";
import { formatDate } from "@/components/PostList";
import { excerpt, getPosts, getSlugEntries, isStockImage, type Post } from "@/lib/content";
import { imgAttrs } from "@/lib/images";
import { pageMetadata } from "@/lib/metadata";
import { postsPerPage, site } from "@/lib/site";

// Only the slugs listed below exist; anything else is a 404 (required for a static export).
export const dynamicParams = false;

export function generateStaticParams() {
  return getSlugEntries().map((e) => ({ slug: e.doc.slug }));
}

function find(slug: string) {
  return getSlugEntries().find((e) => e.doc.slug === slug);
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const entry = find((await params).slug);
  if (!entry) return {};
  const d = entry.doc;
  const post = entry.kind === "post" ? (entry.doc as Post) : undefined;
  return pageMetadata({
    title: d.metaTitle ?? d.title,
    description: d.description ?? excerpt(d.body),
    path: d.path,
    image: post?.coverImage ?? d.ogImage ?? (entry.kind === "project" ? entry.doc.cardImage : undefined),
    imageAlt: post?.coverImageAlt ?? d.ogImageAlt,
    type: post ? "article" : "website",
    publishedTime: post?.date,
  });
}

function PostHeader({ post }: { post: Post }) {
  // Many old posts already show their cover inside the text; skip it here so it isn't shown twice.
  // It's still used for Blog cards and share previews.
  const showCover = post.coverImage && !post.body.includes(post.coverImage);
  const cover = showCover ? imgAttrs(post.coverImage!, "(min-width: 768px) 760px, 100vw") : null;
  return (
    <header className="mx-auto max-w-[760px] px-4 pt-10 md:pt-14">
      <h1 className="text-[clamp(1.9rem,5vw,2.75rem)]">{post.title}</h1>
      <p className="mt-2 text-muted">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        {post.minutesToRead ? ` · ${post.minutesToRead} min read` : ""}
      </p>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants with srcset
        <img {...cover} alt={post.coverImageAlt ?? ""} className="mt-8 h-auto w-full rounded-md" />
      )}
    </header>
  );
}

// "All posts" goes back to the Blog page this post is listed on (newest first, postsPerPage per page).
function AllPostsLink({ post }: { post: Post }) {
  const index = getPosts().findIndex((p) => p.slug === post.slug);
  const page = Math.floor(Math.max(index, 0) / postsPerPage) + 1;
  const href = page === 1 ? "/blog-list-software-developer" : `/blog-list-software-developer?page=${page}`;
  return (
    <p className="mx-auto max-w-[760px] px-4 pb-6 text-center">
      <Link href={href} className="button">
        ← All posts
      </Link>
    </p>
  );
}

function PostJsonLd({ post }: { post: Post }) {
  // Structured data so search engines understand this is a dated article by you.
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    datePublished: post.date,
    author: { "@type": "Person", name: site.name, url: site.url },
    url: `${site.url}${post.path}`,
    ...(post.coverImage && !isStockImage(post.coverImage) ? { image: `${site.url}${post.coverImage}` } : {}),
    ...(post.description ? { description: post.description } : {}),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export default async function Page({ params }: PageProps<"/[slug]">) {
  const entry = find((await params).slug);
  if (!entry) notFound();

  if (entry.kind === "post") {
    const post = entry.doc;
    return (
      <>
        <PostJsonLd post={post} />
        <ContentPage title={post.title} body={post.body} titleMode="none" split={false} before={<PostHeader post={post} />} after={<AllPostsLink post={post} />} />
      </>
    );
  }

  return <ContentPage title={entry.doc.title} body={entry.doc.body} titleMode="visible" />;
}
