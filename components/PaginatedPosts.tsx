"use client";

// Shows PAGE_SIZE blog cards at a time with page buttons underneath.
// Every card is still in the HTML (good for search engines); cards on other pages are just hidden,
// and their lazy-loaded images aren't downloaded until their page is shown.
// The current page is kept in the URL (?page=2) so the back button and shared links work.

import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";
import type { ImgAttrs } from "@/lib/images";
import { postsPerPage as PAGE_SIZE } from "@/lib/site";

// The page number lives in the URL. useSyncExternalStore reads it and re-renders when it changes:
// on our own page buttons ("pagechange") and on the browser's back/forward buttons ("popstate").
function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("pagechange", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("pagechange", onChange);
  };
}
const readPage = () => new URLSearchParams(window.location.search).get("page") ?? "1";
const serverPage = () => "1"; // the static HTML is always built as page 1

export type PostCard = {
  path: string;
  title: string;
  date: string;
  dateLabel: string;
  minutesToRead?: number;
  description?: string;
  image?: ImgAttrs;
  imageAlt?: string;
};

export default function PaginatedPosts({ posts }: { posts: PostCard[] }) {
  const pages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const requested = Number(useSyncExternalStore(subscribe, readPage, serverPage));
  const page = requested >= 1 && requested <= pages ? Math.floor(requested) : 1;
  const listRef = useRef<HTMLDivElement>(null);

  function go(n: number) {
    const url = new URL(window.location.href);
    if (n === 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(n));
    window.history.pushState(null, "", url);
    window.dispatchEvent(new Event("pagechange"));
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const start = (page - 1) * PAGE_SIZE;

  return (
    <div ref={listRef} className="scroll-mt-28">
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, i) => (
          <li key={post.path} hidden={i < start || i >= start + PAGE_SIZE} className="overflow-hidden rounded-lg bg-surface shadow-sm">
            {/* No prefetch: prefetching every visible card would also download each post's cover image. */}
            <Link href={post.path} prefetch={false} className="group flex h-full flex-col">
              <div className="aspect-video overflow-hidden bg-line/40">
                {post.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants with srcset
                  <img
                    {...post.image}
                    alt={post.imageAlt ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h2 className="text-xl group-hover:underline">{post.title}</h2>
                <p className="text-sm text-muted">
                  <time dateTime={post.date}>{post.dateLabel}</time>
                  {post.minutesToRead ? ` · ${post.minutesToRead} min read` : ""}
                </p>
                {post.description && <p className="text-muted">{post.description}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav aria-label="Blog pages" className="mt-10 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => go(page - 1)} disabled={page === 1} className="button min-h-11 px-4 disabled:pointer-events-none disabled:opacity-40">
            ← Previous
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => go(n)}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
              className={`h-11 w-11 rounded-md border transition-colors ${n === page ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink"}`}
            >
              {n}
            </button>
          ))}
          <button type="button" onClick={() => go(page + 1)} disabled={page === pages} className="button min-h-11 px-4 disabled:pointer-events-none disabled:opacity-40">
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
