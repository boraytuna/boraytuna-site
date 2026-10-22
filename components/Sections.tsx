// Renders content sections from lib/markdown.ts. Markers in the Markdown become components here.
// The HTML comes only from the repo's own Markdown, rendered at build time (no visitor input),
// so injecting it with dangerouslySetInnerHTML is safe here.

import type { Marker, Section } from "@/lib/markdown";
import ContactForm from "./ContactForm";
import SocialLinks from "./SocialLinks";
import PostList from "./PostList";
import ProjectList from "./ProjectList";

function MarkerBlock({ name }: { name: Marker }) {
  switch (name) {
    case "contact-form":
      return <ContactForm />;
    case "social-links":
      return <SocialLinks className="justify-center" />;
    case "blog-list":
      return <PostList />;
    case "project-list":
      return <ProjectList />;
  }
}

export default function Sections({ sections }: { sections: Section[] }) {
  let splitIndex = 0;
  return (
    <>
      {sections.map((s, i) => {
        if (s.layout === "split") {
          // Alternate the image side on wide screens, like the old site's rows.
          const imageFirst = splitIndex++ % 2 === 1;
          return (
            <section key={i} className="mx-auto grid max-w-[1100px] items-center gap-8 px-4 py-12 md:grid-cols-2 md:gap-14 md:py-20">
              <div className={`prose ${s.longText ? "text-left" : "text-center"} ${imageFirst ? "md:order-2" : ""}`} dangerouslySetInnerHTML={{ __html: s.text }} />
              <div className="prose" dangerouslySetInnerHTML={{ __html: s.image }} />
            </section>
          );
        }
        return (
          <section key={i} className="mx-auto max-w-[1100px] px-4 py-10 md:py-14">
            {s.blocks.map((b, j) =>
              b.type === "html" ? (
                <div key={j} className="prose" dangerouslySetInnerHTML={{ __html: b.html }} />
              ) : (
                <div key={j} className={`mx-auto my-8 ${b.name === "blog-list" || b.name === "project-list" ? "max-w-[1100px]" : "max-w-[760px]"}`}>
                  <MarkerBlock name={b.name} />
                </div>
              ),
            )}
          </section>
        );
      })}
    </>
  );
}
