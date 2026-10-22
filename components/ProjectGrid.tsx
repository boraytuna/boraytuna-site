"use client";

// Project cards with the category filter from the old Projects page.
// The cards are rendered at build time; this component only shows/hides them by category.

import Link from "next/link";
import { useState } from "react";
import type { ImgAttrs } from "@/lib/images";

export type ProjectCard = {
  path: string;
  title: string;
  summary: string;
  image?: ImgAttrs;
  imageAlt?: string;
  categories: string[];
};

export default function ProjectGrid({ projects, categories }: { projects: ProjectCard[]; categories: string[] }) {
  const [active, setActive] = useState("All");
  const shown = active === "All" ? projects : projects.filter((p) => p.categories.includes(active));

  return (
    <div>
      <p className="mb-3 text-center font-heading text-xl" id="filter-label">Choose a category</p>
      <div role="group" aria-labelledby="filter-label" className="mb-10 flex flex-wrap justify-center gap-2">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={active === c}
            onClick={() => setActive(c)}
            className={`min-h-11 rounded-full border px-4 py-2 transition-colors ${
              active === c ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <li key={p.path} className="flex flex-col overflow-hidden rounded-lg bg-surface shadow-sm">
            {/* No prefetch: prefetching every visible card would also download each project's images. */}
            <Link href={p.path} prefetch={false} className="group flex flex-1 flex-col">
              <div className="aspect-video overflow-hidden bg-line/40">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants with srcset
                  <img
                    {...p.image}
                    sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                    alt={p.imageAlt ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-center font-heading text-2xl text-muted">{p.title}</div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h2 className="text-xl">{p.title}</h2>
                <p className="flex-1 text-muted">{p.summary}</p>
                <span className="mt-2 text-accent group-hover:underline">Check out the project!</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
