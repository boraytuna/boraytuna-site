import type { NextConfig } from "next";
import os from "node:os";

// This computer's addresses on the local network (e.g. 192.168.1.244), so `npm run dev` also
// works from a phone on the same Wi-Fi. Only affects the dev server, not the built site.
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  // Fully static site: `next build` writes plain HTML/CSS/JS to ./out, which is synced to S3.
  output: "export",
  allowedDevOrigins: lanAddresses,
  // Keep URLs exactly as on the old site (/my-projects, not /my-projects/).
  // Pages are emitted as out/my-projects.html; a CloudFront Function maps /my-projects -> /my-projects.html.
  trailingSlash: false,
  // Images are pre-resized to WebP at build time by scripts/optimize-images.mjs,
  // so Next's runtime image optimizer (which needs a server) is not used.
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
