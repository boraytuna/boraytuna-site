// Blog post cards, newest first. The data is prepared at build time (Server Component) and
// handed to PaginatedPosts, which shows one page of cards at a time.

import { getPosts } from "@/lib/content";
import { imgAttrs } from "@/lib/images";
import PaginatedPosts, { type PostCard } from "./PaginatedPosts";

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default function PostList() {
  const posts: PostCard[] = getPosts().map((post) => ({
    path: post.path,
    title: post.title,
    date: post.date,
    dateLabel: formatDate(post.date),
    minutesToRead: post.minutesToRead,
    description: post.description,
    image: post.coverImage ? imgAttrs(post.coverImage, "(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw") : undefined,
    imageAlt: post.coverImageAlt,
  }));
  return <PaginatedPosts posts={posts} />;
}
