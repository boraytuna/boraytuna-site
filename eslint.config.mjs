import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Read-only source material from the old site, and generated files.
    "hostinger-export/**",
    "public/_img/**",
    ".generated/**",
  ]),
  {
    // CloudFront Functions are plain scripts: `handler` is called by CloudFront, not by our code.
    files: ["infra/cloudfront-url-rewrite.js"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^handler$" }] },
  },
]);

export default eslintConfig;
