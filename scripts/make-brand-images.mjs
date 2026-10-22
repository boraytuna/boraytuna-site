#!/usr/bin/env node
// One-off: build the favicon, Apple touch icon and default social-share (Open Graph) image from the logo.
// Run with `node scripts/make-brand-images.mjs` after changing the logo; the outputs are committed.
//
//   app/icon.png             32x32 favicon (Next.js picks it up automatically)
//   app/apple-icon.png       180x180 home-screen icon
//   public/og-default.png    1200x630 preview shown when the site is shared on LinkedIn, X, WhatsApp...
//                            (set explicitly in lib/metadata.ts so blog posts can use their own cover instead)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'public/images/logo-aop63rxbqgfzze3e.png');
const BG = '#f1f1f1';

// The controller graphic is the left part of the wide logo.
const meta = await sharp(LOGO).metadata();
const markWidth = Math.round(meta.width * 0.235);
const markRaw = await sharp(LOGO).extract({ left: 0, top: 0, width: markWidth, height: meta.height }).png().toBuffer();
const mark = await sharp(markRaw).trim().png().toBuffer(); // sharp runs trim before extract in one pipeline, so two steps

async function icon(size, file, padding) {
	const inner = Math.round(size * (1 - padding * 2));
	const fitted = await sharp(mark).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
	await sharp({ create: { width: size, height: size, channels: 4, background: padding ? BG : { r: 0, g: 0, b: 0, alpha: 0 } } })
		.composite([{ input: fitted, gravity: 'center' }])
		.png()
		.toFile(path.join(ROOT, 'app', file));
}
await icon(32, 'icon.png', 0);
await icon(180, 'apple-icon.png', 0.12);

// Social card: wide logo, name, and the tagline already used in the home page title.
const logo = await sharp(LOGO).resize({ width: 760 }).png().toBuffer();
const logoMeta = await sharp(logo).metadata();
const text = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <style>
    .name { font: 500 56px 'Prompt', 'Helvetica Neue', Arial, sans-serif; fill: #1d1e20; }
    .tag  { font: 400 34px 'Lato', 'Helvetica Neue', Arial, sans-serif; fill: #4a4d52; }
    .url  { font: 400 26px 'Lato', 'Helvetica Neue', Arial, sans-serif; fill: #176be0; }
  </style>
  <text x="600" y="420" text-anchor="middle" class="name">Boray Tuna Gören</text>
  <text x="600" y="478" text-anchor="middle" class="tag">Swimmer &amp; Developer</text>
  <text x="600" y="560" text-anchor="middle" class="url">boraytuna.com</text>
</svg>`);
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BG } })
	.composite([
		{ input: logo, top: 90, left: Math.round((1200 - logoMeta.width) / 2) },
		{ input: text, top: 0, left: 0 },
	])
	.png()
	.toFile(path.join(ROOT, 'public/og-default.png'));

console.log('[brand] wrote app/icon.png, app/apple-icon.png, public/og-default.png');
