// Server wrapper: reads projects at build time and hands plain data to the interactive grid.

import { getProjects } from "@/lib/content";
import { imgAttrs } from "@/lib/images";
import { projectCategories } from "@/lib/site";
import ProjectGrid from "./ProjectGrid";

export default function ProjectList() {
  const projects = getProjects().map((p) => ({
    path: p.path,
    title: p.cardTitle ?? p.title,
    summary: p.summary,
    image: p.cardImage ? imgAttrs(p.cardImage) : undefined,
    imageAlt: p.cardImageAlt,
    categories: p.categories ?? [],
  }));
  return <ProjectGrid projects={projects} categories={projectCategories} />;
}
