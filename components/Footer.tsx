import Link from "next/link";
import { nav, site } from "@/lib/site";
import SocialLinks from "./SocialLinks";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <SocialLinks className="justify-center" />
      </div>
      <p className="pb-8 text-center text-sm text-muted">
        © {new Date().getFullYear()} {site.name}
      </p>
    </footer>
  );
}
