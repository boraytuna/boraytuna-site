"use client";

// Videos render as a thumbnail with a play button (see lib/markdown.ts). On click we swap in the
// real YouTube player. Loading ~1 MB of player code per video only when asked keeps pages fast.
// Without JavaScript the thumbnail is a normal link to the video on YouTube.

import { useEffect } from "react";

export default function YouTubeLite() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(".yt-lite__link");
      const box = link?.closest<HTMLElement>(".yt-lite");
      const id = box?.dataset.id;
      if (!box || !id) return;
      e.preventDefault();
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
      iframe.title = "YouTube video";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      box.replaceChildren(iframe);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
