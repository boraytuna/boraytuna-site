import ContentPage from "@/components/ContentPage";
import { excerpt, getPage } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

const page = getPage("home");

export const metadata = pageMetadata({
  title: page.metaTitle ?? page.title,
  description: page.description ?? excerpt(page.body),
  path: "/",
  image: page.ogImage,
  imageAlt: page.ogImageAlt,
});

export default function Page() {
  return <ContentPage title={page.title} body={page.body} titleMode="sr-only" className="light-headings" />;
}
