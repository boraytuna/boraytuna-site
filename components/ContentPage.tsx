// A Markdown-backed page: optional title, then its sections.

import { renderSections, hasH1 } from "@/lib/markdown";
import Sections from "./Sections";

type Props = {
  title: string;
  body: string;
  // Pages whose Markdown has no top-level heading get one: visible, for screen readers/SEO only,
  // or none when the caller renders its own (blog post header).
  titleMode?: "visible" | "sr-only" | "none";
  before?: React.ReactNode;
  after?: React.ReactNode;
  split?: boolean;
  className?: string;
};

export default async function ContentPage({ title, body, titleMode = "visible", before, after, split, className }: Props) {
  const sections = await renderSections(body, { split });
  const needsTitle = titleMode !== "none" && !hasH1(body);
  return (
    <article className={className}>
      {needsTitle &&
        (titleMode === "visible" ? (
          <header className="mx-auto max-w-[1100px] px-4 pt-12 md:pt-16">
            <h1 className="prose text-center text-[clamp(2rem,5vw,2.75rem)]">{title}</h1>
          </header>
        ) : (
          <h1 className="sr-only">{title}</h1>
        ))}
      {before}
      <Sections sections={sections} />
      {after}
    </article>
  );
}
