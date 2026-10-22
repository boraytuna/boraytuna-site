// Built to out/404.html; CloudFront is configured to serve it for unknown URLs.

import Link from "next/link";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[760px] px-4 py-24 text-center">
      <h1 className="text-[clamp(2rem,5vw,2.75rem)]">Page not found</h1>
      <p className="mt-4 text-muted">The page you are looking for doesn&apos;t exist or has moved.</p>
      <p className="mt-8 flex flex-wrap justify-center gap-4">
        <Link href="/" className="button">Home</Link>
        <Link href="/my-projects" className="button">Projects</Link>
        <Link href="/blog-list-software-developer" className="button">Blog</Link>
      </p>
    </section>
  );
}
