"use client";

// Site header: logo, nav with the current page underlined, and a menu button on small screens.
// It's a Client Component because it needs the current URL (usePathname) and open/closed state.

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { nav, site } from "@/lib/site";

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-page/95 backdrop-blur border-b border-line/60">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-4 py-4 md:py-6">
        <Link href="/" className="shrink-0" aria-label={`${site.name}, home`} onClick={() => setOpen(false)}>
          <Image src={site.logoSmall} alt="Boraytuna" width={480} height={132} priority className="h-8 w-auto md:h-12" />
        </Link>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md md:hidden"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>

        <nav
          id="site-nav"
          aria-label="Main"
          className={`${open ? "block" : "hidden"} absolute inset-x-0 top-full border-b border-line bg-page md:static md:block md:border-0 md:bg-transparent`}
        >
          <ul className="flex flex-col px-4 pb-4 md:flex-row md:items-center md:gap-10 md:p-0 lg:gap-12">
            {nav.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`block py-3 text-lg md:py-1 md:text-xl underline-offset-8 decoration-2 hover:underline ${active ? "underline" : ""}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
