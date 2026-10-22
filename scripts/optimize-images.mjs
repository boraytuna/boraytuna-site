#!/usr/bin/env node
// Build step: make small, mobile-friendly WebP copies of every image in public/images.
//
// The originals are full-size screenshots (often 3000px+ PNGs). Browsers pick the right size from
// the srcset the site generates, so a phone downloads a ~480px WebP instead of a multi-MB PNG.
//
//   public/images/foo.png  ->  public/_img/foo-480.webp, foo-960.webp, foo-1600.webp
//   .generated/images.json ->  { "/images/foo.png": { width, height, variants: [[480, "/_img/foo-480.webp"], ...] } }
//
// Both outputs are gitignored and rebuilt in CI. Existing variants are skipped, so re-runs are fast.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public/images');
const OUT = path.join(ROOT, 'public/_img');
const MANIFEST = path.join(ROOT, '.generated/images.json');
const WIDTHS = [480, 960, 1600];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const manifest = {};
let made = 0;

for (const file of files) {
	const input = path.join(SRC, file);
	const meta = await sharp(input).metadata();
	const base = file.replace(/\.[^.]+$/, '');
	const widths = WIDTHS.filter((w) => w < meta.width);
	widths.push(Math.min(meta.width, WIDTHS.at(-1)));
	const variants = [];
	for (const w of [...new Set(widths)].sort((a, b) => a - b)) {
		const name = `${base}-${w}.webp`;
		const out = path.join(OUT, name);
		if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(input).mtimeMs) {
			await sharp(input).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
			made++;
		}
		variants.push([w, `/_img/${name}`]);
	}
	manifest[`/images/${file}`] = { width: meta.width, height: meta.height, variants };
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`[optimize-images] ${files.length} images, ${made} variants written`);
